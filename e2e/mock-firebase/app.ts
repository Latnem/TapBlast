// Test double for firebase/app (used only by `vite build --mode e2e`).
export const initializeApp = (_config: unknown) => ({ name: 'mock' });
