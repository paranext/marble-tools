# marble-tools

Scripts and utilities for transforming and preparing MARBLE data for use in Platform and Paratext

## Requirements

This repo assumes that you have access to MARBLE data from the ubsicap organization separately and have cloned the following repositories at the same level (i.e., as siblings in the directory hierarchy) as this repo:

- marble-enhanced-resources
- marble-indexes
- marble-lexicon
- marble-mappings
- marble-tools

Not all of these repositories may be used in scripts at this time. Those are just the known, expected sources of data for scripts and tools in this repository.

## Getting Started

1. **Clone the repository**:

   ```
   git clone <repository-url>
   cd marble-tools
   ```

2. **Install dependencies**:

   ```
   npm install
   ```

3. **Run scripts as needed**:
   ```
   npm run convert-sdbg
   ```

## License

This project is licensed under the MIT License. All data needed to run this project is licensed under separate terms.
