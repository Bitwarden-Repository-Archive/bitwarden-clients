import { signal } from "@lit-labs/signals";

// Loading state for whole notification experience,
// to be consumed by components which need to reflect that state
// (e.g. waiting on a user save action, vault decrypt after unlock, etc)
export const notificationIsLoading = signal<boolean>(false);
