// Multi-agent configuration for age-specific tutoring
export const AGENTS = {
  k2:      "agent_0101k6691t11ew6bcfm3396wfhza",  // K-2
  g3_5:    "agent_4501k66bf389e01t212acwk5vc26",   // Grades 3-5
  g6_8:    "agent_3701k66bmce0ecr8mt98nvc4pb96",   // Grades 6-8
  g9_12:   "agent_6301k66brd9gfhqtey7t3tf1masf",   // Grades 9-12
  college: "agent_8901k66cfk6ae6v8h7gj1t21enqa",   // College/Adult
} as const;

export const GREETINGS = {
  k2:      "Hi {studentName}! Ready to learn? What do you want to work on?",
  g3_5:    "Hi {studentName}! What subject should we start with?",
  g6_8:    "Hello {studentName}! Which subject are you working on today?",
  g9_12:   "Hey {studentName}! What do you need help with?",
  college: "Hi {studentName}! What topic should we dive into?",
} as const;

export type AgentLevel = keyof typeof AGENTS;