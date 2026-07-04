/**
 * vdom/component.ts — Class-based Component (OOP style)
 *
 * Usage:
 *   class Counter extends Component<{}, { count: number }> {
 *     initialState() { return { count: 0 }; }
 *     render() {
 *       return <div onClick={() => this.setState({ count: this.state.count + 1 })}>
 *         {this.state.count}
 *       </div>;
 *     }
 *   }
 */

import type { ComponentInstance, VNode } from "./types";
import { scheduleFiberRender, type Fiber } from "./hooks";

export abstract class Component<P = {}, S = {}> implements ComponentInstance {
  props: P;
  state: S;
  /** @internal — bound by the VDOM during mount. */
  _fiber: Fiber | null = null;

  constructor(props: P) {
    this.props = props;
    this.state = this.initialState();
  }

  /** Override to provide initial state. */
  initialState(): S {
    return {} as S;
  }

  /** The core render method — must return a VNode tree (or null). */
  abstract render(): VNode | null;

  /**
   * Merge partial state and schedule a re-render.
   * Accepts an object (shallow-merged) or an updater function.
   */
  setState(update: Partial<S> | ((prev: S) => Partial<S>)) {
    const partial = typeof update === "function" ? (update as (p: S) => Partial<S>)(this.state) : update;
    if (partial && typeof partial === "object") {
      Object.assign(this.state, partial);
    }
    if (this._fiber) scheduleFiberRender(this._fiber);
  }

  /** @internal — called by VDOM when props change. */
  _updateProps(nextProps: P) {
    this.props = nextProps;
  }

  // ── Lifecycle hooks (can be overridden) ──

  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
}
