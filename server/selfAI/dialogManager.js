/**
 * 对话管理器 - Dialog Manager
 * 
 * 功能：
 * 1. 对话状态管理 - 有限状态机
 * 2. 上下文管理 - 多轮对话记忆
 * 3. 槽位填充 - 收集必要信息
 * 4. 对话策略 - 决定下一步动作
 */

class DialogManager {
  constructor(maxContextTurns = 10) {
    this.maxContextTurns = maxContextTurns;
    
    // 对话状态定义
    this.states = {
      IDLE: 'idle',           // 空闲状态
      GREETING: 'greeting',   // 问候状态
      TASK: 'task',           // 任务执行状态
      CLARIFY: 'clarify',     // 澄清状态
      CONFIRM: 'confirm',     // 确认状态
      COMPLETE: 'complete'    // 完成状态
    };

    // 状态转移规则
    this.transitions = this.initTransitions();
    
    // 槽位定义
    this.slotDefinitions = this.initSlotDefinitions();
  }

  /**
   * 初始化状态转移规则
   */
  initTransitions() {
    return {
      'idle': {
        'greeting': 'greeting',
        'ask_capability': 'task',
        'code_help': 'task',
        'explain': 'task',
        'how_to': 'task',
        'calculate': 'task',
        'translate': 'task',
        'question': 'task',
        'chitchat': 'task',
        'default': 'task'
      },
      'greeting': {
        'greeting': 'greeting',
        'goodbye': 'idle',
        'default': 'task'
      },
      'task': {
        'thanks': 'complete',
        'goodbye': 'idle',
        'greeting': 'greeting',
        'default': 'task'
      },
      'clarify': {
        'default': 'task'
      },
      'confirm': {
        'confirm_yes': 'complete',
        'confirm_no': 'task',
        'default': 'confirm'
      },
      'complete': {
        'default': 'idle'
      }
    };
  }

  /**
   * 初始化槽位定义
   */
  initSlotDefinitions() {
    return {
      'code_help': {
        required: ['task_description'],
        optional: ['programming_language', 'framework'],
        prompts: {
          'task_description': '请描述您想要实现的功能',
          'programming_language': '您希望使用什么编程语言？'
        }
      },
      'translate': {
        required: ['source_text', 'target_language'],
        optional: ['source_language'],
        prompts: {
          'source_text': '请提供要翻译的文本',
          'target_language': '您想翻译成什么语言？'
        }
      },
      'weather': {
        required: ['city'],
        optional: ['date'],
        prompts: {
          'city': '请问您想查询哪个城市的天气？'
        }
      }
    };
  }

  /**
   * 创建新的对话上下文
   */
  createContext() {
    return {
      state: this.states.IDLE,
      currentIntent: null,
      slots: {},
      history: [],
      turnCount: 0,
      lastUpdateTime: Date.now(),
      metadata: {}
    };
  }

  /**
   * 处理对话
   */
  process(nluResult, context) {
    const { intent, entities, confidence } = nluResult;

    // 更新轮次
    context.turnCount++;
    context.lastUpdateTime = Date.now();

    // 状态转移
    const newState = this.transition(context.state, intent);
    const previousState = context.state;
    context.state = newState;

    // 更新当前意图
    if (intent !== 'unknown' && confidence > 0.3) {
      context.currentIntent = intent;
    }

    // 槽位填充
    this.fillSlots(context, entities, nluResult);

    // 决定动作
    const action = this.decideAction(context, nluResult);

    // 记录历史
    context.history.push({
      turn: context.turnCount,
      intent,
      entities,
      state: { from: previousState, to: newState },
      timestamp: Date.now()
    });

    // 限制历史长度
    if (context.history.length > this.maxContextTurns) {
      context.history = context.history.slice(-this.maxContextTurns);
    }

    return {
      state: newState,
      previousState,
      action: action.type,
      skill: action.skill,
      params: action.params,
      query: action.query,
      data: action.data,
      needClarification: action.needClarification,
      clarificationPrompt: action.clarificationPrompt
    };
  }

  /**
   * 状态转移
   */
  transition(currentState, intent) {
    const stateTransitions = this.transitions[currentState] || this.transitions['idle'];
    return stateTransitions[intent] || stateTransitions['default'] || 'task';
  }

  /**
   * 槽位填充
   */
  fillSlots(context, entities, nluResult) {
    const intent = context.currentIntent;
    const slotDef = this.slotDefinitions[intent];

    if (!slotDef) return;

    // 从实体中填充槽位
    for (const [entityType, value] of Object.entries(entities)) {
      // 映射实体类型到槽位名
      const slotMapping = {
        'programming_language': 'programming_language',
        'city': 'city',
        'date': 'date',
        'number': 'number'
      };

      const slotName = slotMapping[entityType];
      if (slotName && (slotDef.required.includes(slotName) || slotDef.optional.includes(slotName))) {
        context.slots[slotName] = value;
      }
    }

    // 从原始文本中提取任务描述
    if (slotDef.required.includes('task_description') && !context.slots['task_description']) {
      context.slots['task_description'] = nluResult.originalText;
    }

    if (slotDef.required.includes('source_text') && !context.slots['source_text']) {
      context.slots['source_text'] = nluResult.originalText;
    }
  }

  /**
   * 决定动作
   */
  decideAction(context, nluResult) {
    const { intent, confidence } = nluResult;

    // 低置信度时请求澄清
    if (confidence < 0.3 && intent === 'unknown') {
      return {
        type: 'clarify',
        needClarification: true,
        clarificationPrompt: '抱歉，我不太理解您的意思，能否换个方式描述一下？'
      };
    }

    // 检查槽位是否完整
    const slotDef = this.slotDefinitions[intent];
    if (slotDef) {
      const missingSlots = slotDef.required.filter(slot => !context.slots[slot]);
      if (missingSlots.length > 0) {
        const firstMissing = missingSlots[0];
        return {
          type: 'clarify',
          needClarification: true,
          clarificationPrompt: slotDef.prompts[firstMissing] || `请提供${firstMissing}`
        };
      }
    }

    // 根据意图决定动作
    const intentActionMap = {
      'greeting': { type: 'direct', data: { responseType: 'greeting' } },
      'goodbye': { type: 'direct', data: { responseType: 'goodbye' } },
      'thanks': { type: 'direct', data: { responseType: 'thanks' } },
      'ask_capability': { type: 'direct', data: { responseType: 'capability' } },
      'code_help': { type: 'skill', skill: 'code_generator', params: context.slots },
      'explain': { type: 'knowledge', query: nluResult.originalText },
      'how_to': { type: 'knowledge', query: nluResult.originalText },
      'calculate': { type: 'skill', skill: 'calculator', params: { expression: nluResult.originalText } },
      'datetime': { type: 'skill', skill: 'datetime', params: {} },
      'translate': { type: 'skill', skill: 'translator', params: context.slots },
      'chitchat': { type: 'direct', data: { responseType: 'chitchat', topic: nluResult.keywords[0] } },
      'compare': { type: 'knowledge', query: nluResult.originalText },
      'recommend': { type: 'knowledge', query: nluResult.originalText },
      'summarize': { type: 'skill', skill: 'summarizer', params: { text: nluResult.originalText } },
      'question': { type: 'knowledge', query: nluResult.originalText }
    };

    return intentActionMap[intent] || { type: 'knowledge', query: nluResult.originalText };
  }

  /**
   * 更新上下文
   */
  updateContext(context, nluResult, response) {
    // 如果任务完成，清空槽位
    if (context.state === this.states.COMPLETE) {
      context.slots = {};
      context.currentIntent = null;
    }

    // 记录响应
    context.lastResponse = {
      text: response.text,
      timestamp: Date.now()
    };
  }

  /**
   * 获取对话摘要
   */
  getSummary(context) {
    return {
      state: context.state,
      turnCount: context.turnCount,
      currentIntent: context.currentIntent,
      filledSlots: Object.keys(context.slots),
      recentIntents: context.history.slice(-5).map(h => h.intent)
    };
  }
}

module.exports = DialogManager;
