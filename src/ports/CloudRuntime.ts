import type { AuthProvider } from "./AuthProvider";
import type { RemotePlanRepository } from "./RemotePlanRepository";

export interface CloudRuntime {
  auth: AuthProvider;
  plans: RemotePlanRepository;
}
