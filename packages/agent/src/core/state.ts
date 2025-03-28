import { AgentState } from '../types';
import { Logger } from '../utils/logger';

export class StateManager {
  private state: AgentState;

  constructor(initialState: AgentState) {
    this.state = initialState;
  }

  public getState(): AgentState {
    return { ...this.state };
  }

  public updateState(updates: Partial<AgentState>): AgentState {
    const previousState = { ...this.state };
    this.state = {
      ...this.state,
      ...updates
    };

    // Log state changes
    Logger.stateUpdate('StateManager', {
      previous: previousState,
      current: this.state,
      changes: Object.keys(updates)
    });

    return this.getState();
  }

  public transitionTo(step: AgentState['currentStep']): AgentState {
    return this.updateState({
      currentStep: step,
      lastAction: `Transitioned to ${step} step`
    });
  }

  public addMessage(message: any): AgentState {
    return this.updateState({
      messages: [...this.state.messages, message]
    });
  }

  public addToolResult(toolName: string, result: any): AgentState {
    return this.updateState({
      toolResults: {
        ...this.state.toolResults,
        [toolName]: result
      }
    });
  }
} 