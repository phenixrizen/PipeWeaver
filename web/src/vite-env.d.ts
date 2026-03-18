/// <reference types="vite/client" />

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (_workerId: string, label: string) => Worker;
    };
  }

  interface WorkerGlobalScope {
    MonacoEnvironment?: {
      getWorker?: (_workerId: string, label: string) => Worker;
    };
  }
}

export {};
