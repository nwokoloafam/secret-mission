import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

// Deploy separately after the application, migration, sender and secrets are ready.
export default defineConfig({
  accountId: "67c9248fdc6f54cf6904a83dac7d990d",
  worker: defineWorker({
    name: "secret-mission-email-scheduler",
    entrypoint: "../email-scheduler.ts",
    compatibilityDate: "2026-11-20",
    triggers: [triggers.scheduled({ schedule: "* * * * *" })],
    env: {
      EMAIL_APP_URL: bindings.json(process.env.EMAIL_APP_URL ?? "https://secret-mission.chinniradhika98.workers.dev"),
      EMAIL_DISPATCH_SECRET: bindings.secret(),
    },
  }),
});
