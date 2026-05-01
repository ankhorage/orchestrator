# orchestrator

A declarative installation engine for managing project modules.

## 🎯 What you get

- Install features like modules
- Remove them without breaking your app
- No manual file editing

## ✨ Features

- Deterministic install/uninstall
- Dependency-aware execution

## 🚀 Installation

```bash
bun add @ankhorage/orchestrator
```

## 📦 Usage

```ts
orchestrator.install("expo-localization");
orchestrator.uninstall("expo-localization");
```

## 🧪 Use Cases

- Feature-based app composition
- Safe project scaffolding

## 🧠 Why this exists

Typical tools are one-way. This system enables reversible, structured changes.
