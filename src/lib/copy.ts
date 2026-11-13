// All player-facing wording lives here, so the theme can change without
// touching game logic. Theme: immigration / visa ("visa denied", "green card").
// See background-info/theme-options.md.

export const COPY = {
  gameName: "Secret Mission",
  tagline: "Afam's 31st",
  player: "applicant",
  players: "applicants",
  code: "visa stamp",
  target: "case file",
  mission: "interview task",
  host: "the Consul",
  eliminated: "Visa denied",
  winner: "Green card",
  paused: "Embassy closed — game paused",
  remaining: (n: number) => `${n} ${n === 1 ? "applicant" : "applicants"} remain`,
  endReveal: "Final decisions",
};

export const TOP_COLORS = ["Black", "White", "Grey", "Blue", "Red", "Green", "Yellow", "Pink", "Purple", "Brown", "Patterned"];
export const ACCESSORIES = ["None", "Glasses", "Hat", "Jewelry", "Jacket"];
