import { EventEmitter } from 'node:events';

type PluginConstructor = {
  prototype: object;
};

type PluginModules = Record<string, Record<string, unknown>>;

export type RendererIpc = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  addListener(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
};

type PluginContext = Record<string, (...args: unknown[]) => unknown>;

export function createCapacitorContextApi(
  plugins: PluginModules,
  ipcRenderer: RendererIpc,
  createId: () => string
): Record<string, PluginContext> {
  const contextApi: Record<string, PluginContext> = {};

  Object.values(plugins).forEach((pluginModule) => {
    const defaultExport = pluginModule.default;
    const pluginExports = {
      ...(typeof defaultExport === 'object' && defaultExport !== null ? defaultExport : {}),
      ...Object.fromEntries(Object.entries(pluginModule).filter(([exportName]) => exportName !== 'default')),
    };

    Object.entries(pluginExports)
      .filter((entry): entry is [string, PluginConstructor] => {
        const exported = entry[1];
        return typeof exported === 'function' && 'prototype' in exported;
      })
      .forEach(([className, PluginClass]) => {
        const pluginApi = (contextApi[className] ??= {});
        const functionNames = Object.getOwnPropertyNames(PluginClass.prototype).filter((propertyName) => {
          if (propertyName === 'constructor') return false;
          const descriptor = Object.getOwnPropertyDescriptor(PluginClass.prototype, propertyName);
          return typeof descriptor?.value === 'function';
        });

        functionNames.forEach((functionName) => {
          pluginApi[functionName] ??= (...args) => ipcRenderer.invoke(`${className}-${functionName}`, ...args);
        });

        if (PluginClass.prototype instanceof EventEmitter) {
          const listeners = new Map<string, { type: string; listener: (...args: unknown[]) => void }>();
          const hasListenersOfType = (type: string) =>
            Array.from(listeners.values()).some((listener) => listener.type === type);

          Object.assign(pluginApi, {
            addListener(type: string, callback: (...args: unknown[]) => void) {
              const id = createId();

              if (!hasListenersOfType(type)) {
                ipcRenderer.send(`event-add-${className}`, type);
              }

              const eventHandler = (_event: unknown, ...args: unknown[]) => callback(...args);
              ipcRenderer.addListener(`event-${className}-${type}`, eventHandler);
              listeners.set(id, { type, listener: eventHandler });

              return id;
            },
            removeListener(id: string) {
              const registered = listeners.get(id);
              if (!registered) throw new Error('Invalid id');

              ipcRenderer.removeListener(`event-${className}-${registered.type}`, registered.listener);
              listeners.delete(id);

              if (!hasListenersOfType(registered.type)) {
                ipcRenderer.send(`event-remove-${className}-${registered.type}`);
              }
            },
            removeAllListeners(type?: string) {
              const removedTypes = new Set<string>();

              listeners.forEach((registered, id) => {
                if (!type || registered.type === type) {
                  ipcRenderer.removeListener(`event-${className}-${registered.type}`, registered.listener);
                  removedTypes.add(registered.type);
                  listeners.delete(id);
                }
              });

              removedTypes.forEach((removedType) => {
                ipcRenderer.send(`event-remove-${className}-${removedType}`);
              });
            },
          });
        }
      });
  });

  return contextApi;
}
