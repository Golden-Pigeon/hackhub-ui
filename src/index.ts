/**
 * hh-ui — A lightweight VDOM framework for HackHub mod development.
 *
 * @example Function component (JSX + hooks):
 *   import { h, useState, render } from "hh-ui";
 *   const App = () => { const [n, setN] = useState(0); return <div onClick={() => setN(n+1)}>{n}</div>; };
 *   render(<App/>, document.getElementById("root")!);
 *
 * @example Class component (OOP):
 *   import { Component } from "hh-ui";
 *   class App extends Component<{}, { n: number }> {
 *     initialState() { return { n: 0 }; }
 *     render() { return <div onClick={() => this.setState({ n: this.state.n + 1 })}>{this.state.n}</div>; }
 *   }
 */

// VDOM
export { h, Fragment } from "./vdom/h";
export type { VNode, Child, ComponentType, Props } from "./vdom/types";
export { useState, useEffect, useMemo, useCallback } from "./vdom/hooks";
export { render } from "./vdom/render";
export { Component } from "./vdom/component";

// SDK
export { sdk, FilesAPI, EventsAPI, UIAPI, StorageAPI } from "./sdk/index";
export type { FileInfo } from "./sdk/index";
