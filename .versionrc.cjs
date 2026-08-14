module.exports = {
  skip: { tag: false },
  bumpFiles: ["package.json", "oclif.manifest.json"],
  infile: "CHANGELOG.md",
  header: "# Changelog\n\n",
  scripts: {
    postcommit: "node scripts/split-changelog.mjs",
    posttag: "node scripts/custom-tag-message.mjs",
  },
  types: [
    { type: "feat", section: "✨ Features" },
    { type: "fix", section: "🐛 Bug Fixes" },
    { type: "perf", section: "⚡ Performance" },
    { type: "refactor", section: "♻️ Refactors" },
    { type: "docs", section: "📚 Documentation", hidden: true },
    { type: "test", section: "🧪 Tests", hidden: true },
    { type: "build", section: "🔧 Build", hidden: true },
    { type: "ci", section: "🔁 CI", hidden: true },
    { type: "chore", section: "🧹 Chores", hidden: true },
    { type: "revert", section: "⏪ Reverts", hidden: true },
    { type: "style", section: "💄 Styles", hidden: true },
  ],
};
