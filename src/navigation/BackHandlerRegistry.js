import React, { createContext, useContext, useEffect, useRef } from "react";

// A tiny registry that lets individual screens contribute their own
// "handle Android back" logic without lifting all of their internal
// sub-navigation state up to App.js.
//
// The single hardware-back listener lives in App.js. When back is pressed it
// walks the registered handlers (most-recently-registered first). A handler
// returns `true` if it consumed the event (e.g. it popped its own sub-view),
// or `false`/undefined to let the next handler (ultimately App's screen/tab
// navigation, then app exit) take over.

const BackHandlerContext = createContext(null);

export function BackHandlerProvider({ children }) {
  // Ordered list of { id, handler }. Newest last; we iterate in reverse so the
  // deepest/most-recent screen gets first refusal.
  const handlersRef = useRef([]);
  const nextId = useRef(0);

  const value = useRef({
    register(handler) {
      const id = nextId.current++;
      handlersRef.current.push({ id, handler });
      return () => {
        handlersRef.current = handlersRef.current.filter((h) => h.id !== id);
      };
    },
    // Called by App's hardware-back listener. Returns true if any registered
    // screen handled it.
    runBack() {
      const handlers = handlersRef.current;
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i].handler() === true) return true;
      }
      return false;
    },
  }).current;

  return (
    <BackHandlerContext.Provider value={value}>{children}</BackHandlerContext.Provider>
  );
}

// Access the raw registry (used by App.js to run registered handlers).
export function useBackHandlerRegistry() {
  const ctx = useContext(BackHandlerContext);
  if (!ctx) throw new Error("useBackHandlerRegistry must be used within a BackHandlerProvider");
  return ctx;
}

// Screens call this to contribute a back handler while mounted. `handler`
// should return true if it consumed the back event. `deps` controls when the
// handler is re-registered (like useEffect deps).
export function useScreenBackHandler(handler, deps = []) {
  const { register } = useBackHandlerRegistry();
  // Keep the latest handler in a ref so we don't churn the registry on every
  // render, while still calling the freshest closure.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unregister = register(() => handlerRef.current());
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
