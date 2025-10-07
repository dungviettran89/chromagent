# High-Level Design: Chromagent Modules

This document outlines the high-level design of the various modules within the Chromagent project, which is structured as an npm workspace.

## Modules:

*   **[chromagent-core](./chromagent-core/readme.md):** This module contains the core logic and shared utilities for easier integration with Large Language Models (LLMs). It provides foundational functionalities that can be reused across different Chromagent components.

*   **chromagent-cli:** A simple command-line interface (CLI) tool designed to test Chromagent functions and utilize its utilities. This module provides a direct way to interact with the core functionalities from the terminal.

*   **[chromagent-extension](./chromagent-extension/readme.md):** This module is the Chrome extension itself, providing a side panel chat interface for interacting with LLMs.

*   **chromagent-web:** (Future Module) This module is envisioned as a drop-in LangGraph agent, allowing easy integration of LLM agents into any website. It aims to provide a flexible way to embed LLM capabilities directly into web applications.

*   **chromagent-ui:** (Future Module) This module will provide a simple user interface to allow configuring and talking to LLM agents. It will focus on creating an intuitive and user-friendly experience for managing and interacting with LLMs.
