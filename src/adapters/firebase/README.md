# Firebase adapters

Firebase Authentication and Firestore implementations belong in this directory. No Firebase SDK
types may cross the interfaces under `src/ports/`.

Runtime behavior:

- With all four core `VITE_FIREBASE_*` values empty, `src/app/firebaseBootstrap.ts` returns no cloud
  runtime and the application remains in anonymous local mode.
- Providing only part of the core configuration is rejected. Copy `.env.example` to a local ignored
  environment file and provide all four values only when a Firebase project is intentionally used.
- `VITE_FIREBASE_USE_EMULATORS=true` connects Auth and Firestore to the explicitly configured local
  endpoints. It does not enable a production project, billing, Functions, Storage, or SMS auth.
- Browser persistence and Emulator wiring stay in `runtime.ts`; authentication and plan storage are
  exposed through repository-owned ports.

Local verification:

```sh
npm run test:firebase:emulator
```

The command uses the demo-only project ID `demo-worthwhile-local`, starts Auth and Firestore
Emulators, and runs owner-rule plus two-context adapter tests. Firebase's Firestore Emulator requires
a local Java Runtime. `scripts/run-firebase-emulator.mjs` discovers `JAVA_HOME` or Homebrew
OpenJDK 21 and adjusts `PATH` only for the Emulator process, so no global shell-profile change is
required. The complete `npm run verify` gate includes this command and must remain red if the runtime
or Emulator checks are unavailable.
