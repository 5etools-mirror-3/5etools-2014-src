
# 5etools Development Guide for AI Coding Agents


## Project Overview
5etools is a comprehensive D&D 5e reference site built with vanilla JavaScript, modular ES6 imports, and JSON data files. The architecture emphasizes clean data separation, modular rendering, and client-side filtering/search functionality.

## Core Architecture

### Data Layer
- **JSON Files**: Structured data in `data/` follows strict schemas with tagged references (e.g., `{@creature goblin}`)
- **Generated Data**: `data/generated/` contains auto-generated files from `npm run gen`
- **Data Validation**: All JSON is validated via comprehensive test suite in `test/`

### Module System
- **ES6 Modules**: Strict modular architecture with explicit imports/exports
- **Global Namespace**: Core utilities exposed via `globalThis` in `js/utils.js`
- **Renderer System**: Central `js/render.js` handles all content rendering with pluggable tag processors

### Page Structure
Each content type follows a consistent pattern:
```
[content].html → js/[content].js → filter-[content].js → render-[content].js
```

## Key Development Workflows

### Build Commands
```bash
npm run gen          # Generate all derived data files
npm run build:css    # Compile SCSS to CSS
npm run test         # Run full test suite (required before commits)
npm run serve:dev    # Local dev server on :5050
```

### Data Editing
1. Edit source JSON in `data/`
2. Run `npm run gen` to update generated files
3. Run `npm run test:data` to validate changes
4. Use `npm run lint:data` to format JSON consistently

### Adding New Content
1. Update relevant JSON schema in `data/`
2. Add filter logic in `js/filter-[type].js`
3. Add rendering logic in `js/render-[type].js`
4. Update page-specific JavaScript in `js/[type].js`

## Critical Patterns

### Filter System
The filter architecture is central to the site's functionality:
- `FilterBox` manages multiple filter instances
- Each content type has a dedicated `PageFilter[Type]` class
- Filters emit `EVNT_VALCHANGE` events for reactive updates

### Data Reference Tags
Use strict tagging format in JSON entries:
```json
"entries": ["You cast {@spell fireball} at {@creature goblin|MM}."]
```
- Only tag intended mechanical references, not flavor text
- Never tag within `quote` blocks
- Avoid forward references (don't reference newer sources from older ones)

### Converter System
The `js/converter/` modules handle importing external content:
- Each content type has dedicated converter and UI classes
- Entry coalescing in `converterutils-entrycoalesce.js` standardizes list formatting
- Tag processors automatically link references during conversion

### Testing Strategy
- **JSON Validation**: `test/test-json.js` validates all data schemas
- **Tag Validation**: `test/test-tags.js` ensures reference integrity
- **Image Validation**: Multiple image tests verify asset consistency
- **Unit Tests**: Jest tests in `test/jest/` for utility functions

## Code Style Requirements

### JavaScript
- Use tabs (not spaces) for indentation
- ES6+ features available in Chrome/Firefox for 6+ months
- Avoid jQuery when possible (legacy code only)
- Follow ESLint configuration in `eslint.config.mjs`

### Data Formatting
- JSON formatted with tabs, one line per value/bracket
- Use Unicode escapes for special characters: `\u2014` (em dash), `\u2013` (en dash), `\u2212` (minus)
- Measurement format: `60-foot` (adjective) vs `60 ft.` (noun) vs `2/Turn` (time)

### CSS
- Use BEM naming strategy (`block__element--modifier`)
- SCSS source files in `scss/`, compiled to `css/`

## Integration Points

### Service Worker
Optional PWA functionality built via `npm run build:sw` - handles client-side caching for offline use.

### External Dependencies
- Minimal external dependencies (see `package.json`)
- Custom utilities in `js/utils.js` instead of external libraries
- Font rendering handled via `js/utils-font.js`

## Debugging Workflows
- Use browser dev tools extensively (site designed for client-side debugging)
- Check `npm run test` output for validation errors
- Use `npm run spellcheck:check-data` for content QA
- Service worker can interfere with local changes - disable when developing

## File Naming Conventions
- Content pages: `[type].html` + `js/[type].js`
- Filters: `js/filter-[type].js`
- Renderers: `js/render-[type].js`
- Utilities: `js/utils-[purpose].js`
- Converters: `js/converter/converter[type].js` + `converterutils-[type].js`
