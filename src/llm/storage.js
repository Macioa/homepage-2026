// Browser storage that never throws (private windows and blocked storage just act empty).

function safeStore(getStorage) {
  const run = (fn, fallback) => {
    try {
      return fn(getStorage());
    } catch {
      return fallback;
    }
  };

  return {
    get: (key) => run((s) => s.getItem(key), null),
    set: (key, value) => run((s) => s.setItem(key, String(value))),
    remove: (key) => run((s) => s.removeItem(key)),
    take(key) {
      const value = this.get(key);
      this.remove(key);
      return value;
    },
  };
}

// Survives browser restarts: learned facts about this machine.
export const machineStore = safeStore(() => localStorage);

// Survives page reloads only: hand-offs from a page to the one that replaces it.
export const reloadStore = safeStore(() => sessionStorage);
