# Complete 5etools Character Creation Guide

This comprehensive guide will walk you through creating a complete D&D 5e character in JSON format for 5etools, from absolute beginner to advanced features.

## Quick Start Checklist

Before you begin, you'll need:
- ✅ A text editor (VS Code, Notepad++, or any JSON editor)
- ✅ Basic understanding of your D&D character concept
- ✅ Character sheet or notes with stats, class, race, etc.
- ✅ Access to D&D 5e rules for reference

## Table of Contents

1. [Step-by-Step Character Creation](#1-step-by-step-character-creation)
2. [Basic Character Structure](#2-basic-character-structure)
3. [Core Character Information](#3-core-character-information)
4. [Ability Scores and Modifiers](#4-ability-scores-and-modifiers)
5. [Classes and Multiclassing](#5-classes-and-multiclassing)
6. [Combat Statistics](#6-combat-statistics)
7. [Skills and Proficiencies](#7-skills-and-proficiencies)
8. [Spell System (Complete Guide)](#8-spell-system-complete-guide)
9. [Advanced Tracking Systems](#9-advanced-tracking-systems)
10. [Actions and Combat Abilities](#10-actions-and-combat-abilities)
11. [Equipment and Inventory](#11-equipment-and-inventory)
12. [Character Features and Traits](#12-character-features-and-traits)
13. [Complete Character Examples](#13-complete-character-examples)
14. [Troubleshooting and Tips](#14-troubleshooting-and-tips)

---

## 1. Step-by-Step Character Creation

### Step 1: Start with the Basic Template

Create a new file with `.json` extension and start with this template:

```json
{
  "character": [
    {
      "name": "Your Character Name",
      "source": "homebrew"
    }
  ]
}
```

**💡 Important:** Always save as `.json` file type and use a text editor that validates JSON syntax.

### Step 2: Add Race and Class Information

```json
{
  "character": [
    {
      "name": "Thorin Ironforge",
      "source": "homebrew",
      "race": {
        "name": "Dwarf",
        "subrace": "Mountain Dwarf"
      },
      "class": [
        {
          "name": "Fighter",
          "source": "PHB",
          "level": 3,
          "subclass": {
            "name": "Champion",
            "source": "PHB"
          }
        }
      ]
    }
  ]
}
```

### Step 3: Add Ability Scores

Calculate your ability scores and add them:

```json
{
  "character": [
    {
      "name": "Thorin Ironforge",
      "source": "homebrew",
      "race": {
        "name": "Dwarf",
        "subrace": "Mountain Dwarf"
      },
      "class": [
        {
          "name": "Fighter",
          "source": "PHB",
          "level": 3,
          "subclass": {
            "name": "Champion",
            "source": "PHB"
          }
        }
      ],
      "str": 16,
      "dex": 13,
      "con": 15,
      "int": 12,
      "wis": 14,
      "cha": 10
    }
  ]
}
```

### Step 4: Add Combat Stats

```json
{
  "character": [
    {
      "name": "Thorin Ironforge",
      "source": "homebrew",
      "race": {
        "name": "Dwarf",
        "subrace": "Mountain Dwarf"
      },
      "class": [
        {
          "name": "Fighter",
          "source": "PHB",
          "level": 3,
          "subclass": {
            "name": "Champion",
            "source": "PHB"
          }
        }
      ],
      "alignment": ["L", "G"],
      "ac": [
        {
          "ac": 18,
          "from": ["chain mail", "shield"]
        }
      ],
      "hp": {
        "current": 28,
        "max": 28,
        "temp": 0
      },
      "speed": {
        "walk": 25
      },
      "str": 16,
      "dex": 13,
      "con": 15,
      "int": 12,
      "wis": 14,
      "cha": 10
    }
  ]
}
```

### Step 5: Continue Building Your Character

Follow the detailed sections below to add:
- Saves and skills
- Hit dice and death saves
- Actions and spells
- Equipment and features
- Custom trackers

---

## 2. Basic Character Structure

Every character JSON must follow this exact structure:

```json
{
  "character": [
    {
      // All character data goes here
    }
  ]
}
```

### Why This Structure?

- The `character` array allows for multiple character variants
- 5etools expects this specific format for proper loading
- The array structure supports future expansions

### Multiple Characters in One File

```json
{
  "character": [
    {
      "name": "Character Form 1",
      // character data
    },
    {
      "name": "Character Form 2", 
      // alternate form data
    }
  ]
}
```

---

## 3. Core Character Information

### Required Fields

```json
{
  "name": "Character Name",
  "source": "homebrew",
  "race": {
    "name": "Race Name"
  },
  "class": [
    {
      "name": "Class Name",
      "source": "PHB",
      "level": 1
    }
  ]
}
```

### Race Information

**Simple Race:**
```json
"race": {
  "name": "Human"
}
```

**Race with Subrace:**
```json
"race": {
  "name": "Elf",
  "subrace": "High Elf"
}
```

**Custom Race:**
```json
"race": {
  "name": "Custom Dragonborn",
  "source": "homebrew"
}
```

### Alignment

Use two-letter codes:

```json
"alignment": ["L", "G"]  // Lawful Good
"alignment": ["C", "N"]  // Chaotic Neutral
"alignment": ["N", "E"]  // Neutral Evil
"alignment": ["L", "N"]  // Lawful Neutral
"alignment": ["C", "G"]  // Chaotic Good
```

### Background and Optional Info

```json
{
  "background": {
    "name": "Soldier",
    "source": "PHB"
  },
  "age": 35,
  "height": "5'8\"",
  "weight": "180 lbs"
}
```

---

## 4. Ability Scores and Modifiers

### Basic Ability Scores

```json
{
  "str": 16,    // Strength
  "dex": 14,    // Dexterity  
  "con": 15,    // Constitution
  "int": 12,    // Intelligence
  "wis": 13,    // Wisdom
  "cha": 10     // Charisma
}
```

### Ability Score Guidelines

| Score | Modifier | Description |
|-------|----------|-------------|
| 8-9   | -1       | Below Average |
| 10-11 | +0       | Average |
| 12-13 | +1       | Above Average |
| 14-15 | +2       | Good |
| 16-17 | +3       | Excellent |
| 18-19 | +4       | Exceptional |
| 20    | +5       | Legendary |

### Saving Throws

Add proficient saving throws:

```json
{
  "save": {
    "str": "+6",    // Proficient in Strength saves
    "con": "+5"     // Proficient in Constitution saves
  }
}
```

**💡 How to Calculate Saves:**
- Base = Ability modifier + Proficiency bonus (if proficient)
- Example: STR 16 (+3) + Prof (+3) = +6

### Proficiency Bonus by Level

| Level | Proficiency Bonus |
|-------|-------------------|
| 1-4   | +2 |
| 5-8   | +3 |
| 9-12  | +4 |
| 13-16 | +5 |
| 17-20 | +6 |

```json
"proficiencyBonus": "+3"
```

---

## 5. Classes and Multiclassing

### Single Class Character

```json
"class": [
  {
    "name": "Fighter",
    "source": "PHB",
    "level": 5,
    "subclass": {
      "name": "Champion",
      "source": "PHB"
    }
  }
]
```

### Multiclass Character

```json
"class": [
  {
    "name": "Fighter",
    "source": "PHB", 
    "level": 3,
    "subclass": {
      "name": "Champion",
      "source": "PHB"
    }
  },
  {
    "name": "Rogue",
    "source": "PHB",
    "level": 2,
    "subclass": {
      "name": "Thief",
      "source": "PHB"
    }
  }
]
```

### Class Source Codes

Common source abbreviations:
- **PHB**: Player's Handbook
- **XGE**: Xanathar's Guide to Everything  
- **TCE**: Tasha's Cauldron of Everything
- **SCAG**: Sword Coast Adventurer's Guide
- **homebrew**: Custom/homebrew content

---

## 6. Combat Statistics

### Armor Class

**Simple AC:**
```json
"ac": [
  {
    "ac": 15
  }
]
```

**AC with Sources:**
```json
"ac": [
  {
    "ac": 18,
    "from": ["plate armor", "shield"]
  }
]
```

**Multiple AC Calculations:**
```json
"ac": [
  {
    "ac": 16,
    "from": ["studded leather", "dex", "shield"]
  },
  {
    "ac": 13,
    "condition": "without shield",
    "from": ["studded leather", "dex"]
  }
]
```

### Hit Points

**Complete HP Structure:**
```json
"hp": {
  "current": 45,        // Current HP (editable)
  "max": 52,           // Maximum HP
  "temp": 8,           // Temporary HP (editable)
  "average": 52,       // Average HP for level
  "formula": "8d8 + 16" // HP calculation formula
}
```

**Simple HP:**
```json
"hp": {
  "current": 28,
  "max": 28
}
```

**HP Calculation Guide:**
- **Level 1**: Max hit die + CON modifier
- **Levels 2+**: Previous HP + hit die roll (or average) + CON modifier
- **Average**: (Hit die maximum ÷ 2) + 1 + CON modifier per level

### Speed

**Basic Movement:**
```json
"speed": {
  "walk": 30
}
```

**Multiple Movement Types:**
```json
"speed": {
  "walk": 30,
  "fly": 60,
  "swim": 30,
  "climb": 20,
  "burrow": 15
}
```

---

## 7. Skills and Proficiencies

### Skill Proficiencies

```json
"skill": {
  "athletics": "+6",        // STR-based
  "acrobatics": "+4",       // DEX-based  
  "sleightOfHand": "+4",    // DEX-based
  "stealth": "+4",          // DEX-based
  "arcana": "+3",           // INT-based
  "history": "+3",          // INT-based
  "investigation": "+3",    // INT-based
  "nature": "+3",           // INT-based
  "religion": "+3",         // INT-based
  "animalHandling": "+3",   // WIS-based
  "insight": "+3",          // WIS-based
  "medicine": "+3",         // WIS-based
  "perception": "+7",       // WIS-based (expertise)
  "survival": "+3",         // WIS-based
  "deception": "+2",        // CHA-based
  "intimidation": "+5",     // CHA-based
  "performance": "+2",      // CHA-based
  "persuasion": "+2"        // CHA-based
}
```

### Skill Calculation Guide

**Base Formula:** Ability Modifier + Proficiency Bonus (if proficient)

**Expertise:** Double proficiency bonus

**Examples:**
- **Athletics** (STR-based): STR mod (+3) + Prof (+3) = +6
- **Perception** (WIS-based, expertise): WIS mod (+1) + Double Prof (+6) = +7
- **Stealth** (DEX-based, not proficient): Just DEX mod (+2) = +2

### Languages

```json
"languages": ["Common", "Dwarvish", "Orcish", "Thieves' Cant"]
```

### Tool Proficiencies

```json
"toolProficiencies": [
  "Smith's Tools",
  "Thieves' Tools", 
  "Playing Card Set"
]
```

### Other Proficiencies

```json
"weaponProficiencies": ["Simple weapons", "Martial weapons"],
"armorProficiencies": ["Light armor", "Medium armor", "Heavy armor", "Shields"]
```

---

## 8. Spell System (Complete Guide)

### Understanding Spellcasting Types

**Full Casters:** Wizard, Cleric, Druid, Sorcerer, Bard, Warlock
**Half Casters:** Paladin, Ranger
**Third Casters:** Eldritch Knight Fighter, Arcane Trickster Rogue

### Basic Spell Structure

```json
"spells": {
  "dc": 15,                     // Spell Save DC
  "attackBonus": "+7",          // Spell Attack Bonus
  "ability": "Intelligence",    // Spellcasting Ability
  "levels": {
    // Spell levels go here
  }
}
```

### Calculating Spell Stats

**Spell Save DC:** 8 + Proficiency Bonus + Spellcasting Ability Modifier
**Spell Attack Bonus:** Proficiency Bonus + Spellcasting Ability Modifier

**Example:** Level 5 Wizard with INT 16 (+3)
- **DC**: 8 + 3 + 3 = 14
- **Attack**: +3 + 3 = +6

### Cantrips (Level 0)

```json
"levels": {
  "0": {
    "spells": [
      "mage hand",
      "prestidigitation", 
      "minor illusion",
      "fire bolt"
    ]
  }
}
```

### Leveled Spells with Slots

```json
"levels": {
  "1": {
    "maxSlots": 4,
    "slotsUsed": 2,
    "spells": [
      "magic missile",
      "shield", 
      "identify",
      "detect magic"
    ]
  },
  "2": {
    "maxSlots": 3,
    "slotsUsed": 0,
    "spells": [
      "misty step",
      "web",
      "scorching ray"
    ]
  }
}
```

### Advanced Spell Formats

**Custom/Homebrew Spells:**
```json
"spells": [
  "fireball",
  {
    "name": "Custom Lightning Bolt",
    "source": "homebrew"
  }
]
```

### Complete Caster Examples

**Level 5 Wizard (Full Caster):**
```json
"spells": {
  "dc": 14,
  "attackBonus": "+6",
  "ability": "Intelligence",
  "levels": {
    "0": {
      "spells": ["mage hand", "prestidigitation", "fire bolt", "minor illusion"]
    },
    "1": {
      "maxSlots": 4,
      "slotsUsed": 2,
      "spells": ["magic missile", "shield", "identify", "detect magic", "alarm"]
    },
    "2": {
      "maxSlots": 3,
      "slotsUsed": 1,
      "spells": ["misty step", "web", "scorching ray", "invisibility"]
    },
    "3": {
      "maxSlots": 2,
      "slotsUsed": 0,
      "spells": ["fireball", "counterspell"]
    }
  }
}
```

**Level 3 Warlock (Pact Magic):**
```json
"spells": {
  "dc": 13,
  "attackBonus": "+5",
  "ability": "Charisma",
  "levels": {
    "0": {
      "spells": ["eldritch blast", "prestidigitation"]
    },
    "1": {
      "maxSlots": 0,
      "spells": ["hex", "charm person"]
    },
    "2": {
      "maxSlots": 2,
      "slotsUsed": 0,
      "spells": ["darkness", "invisibility"]
    }
  }
}
```

**Level 5 Paladin (Half Caster):**
```json
"spells": {
  "dc": 13,
  "attackBonus": "+5",
  "ability": "Charisma",
  "levels": {
    "1": {
      "maxSlots": 4,
      "slotsUsed": 1,
      "spells": ["cure wounds", "divine favor", "protection from evil and good"]
    },
    "2": {
      "maxSlots": 2,
      "slotsUsed": 0,
      "spells": ["aid", "find steed"]
    }
  }
}
```

### Spell Slot Progression Tables

**Full Caster Spell Slots:**
| Level | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th |
|-------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 1     | 2   | -   | -   | -   | -   | -   | -   | -   | -   |
| 2     | 3   | -   | -   | -   | -   | -   | -   | -   | -   |
| 3     | 4   | 2   | -   | -   | -   | -   | -   | -   | -   |
| 4     | 4   | 3   | -   | -   | -   | -   | -   | -   | -   |
| 5     | 4   | 3   | 2   | -   | -   | -   | -   | -   | -   |

**Warlock Pact Magic:**
| Level | Slot Level | Number of Slots |
|-------|------------|-----------------|
| 1-2   | 1st        | 1               |
| 3-4   | 2nd        | 2               |
| 5-6   | 3rd        | 2               |
| 7-8   | 4th        | 2               |
| 9-10  | 5th        | 2               |
| 11+   | 5th        | 3               |

---

## 9. Advanced Tracking Systems

### Hit Dice Tracking

Hit dice are used for healing during short rests.

**Single Class:**
```json
"hitDice": {
  "d8": {
    "max": 5,
    "current": 3
  }
}
```

**Multiclass Example:**
```json
"hitDice": {
  "d10": {
    "max": 8,     // Fighter levels
    "current": 5
  },
  "d8": {
    "max": 3,     // Rogue levels  
    "current": 2
  }
}
```

**Hit Die by Class:**
- **d6**: Sorcerer, Wizard
- **d8**: Bard, Cleric, Druid, Monk, Rogue, Warlock  
- **d10**: Fighter, Paladin, Ranger
- **d12**: Barbarian

### Death Saves

Track death saving throws:

```json
"deathSaves": {
  "successes": 1,
  "failures": 0
}
```

**Rules Reminder:**
- 3 successes = stable at 0 HP
- 3 failures = dead
- Natural 20 = regain 1 HP
- Natural 1 = 2 failures

### Custom Trackers

Flexible system for any trackable resource:

**Resource Counters:**
```json
"customTrackers": [
  {
    "name": "Action Surge",
    "type": "counter",
    "current": 0,
    "max": 1,
    "description": "Regains on short or long rest"
  },
  {
    "name": "Rage",
    "type": "counter",
    "current": 2,
    "max": 3,
    "description": "Barbarian rage uses per long rest"
  },
  {
    "name": "Ki Points",
    "type": "counter",
    "current": 5,
    "max": 5,
    "description": "Monk ki points, regain on short rest"
  }
]
```

**Status Conditions:**
```json
"customTrackers": [
  {
    "name": "Advantage on Stealth",
    "type": "condition",
    "active": true,
    "duration": "1 hour",
    "description": "From Pass Without Trace spell"
  },
  {
    "name": "Concentration",
    "type": "condition",
    "active": false,
    "duration": "Variable",
    "description": "Currently concentrating on a spell"
  },
  {
    "name": "Inspiration",
    "type": "condition",
    "active": true,
    "duration": "Until used",
    "description": "DM granted inspiration"
  }
]
```

**Magic Items:**
```json
"customTrackers": [
  {
    "name": "Ring of Spell Storing",
    "type": "counter",
    "current": 3,
    "max": 5,
    "description": "Spell levels stored in ring"
  },
  {
    "name": "Boots of Speed",
    "type": "condition",
    "active": false,
    "duration": "10 minutes",
    "description": "Double speed, extra Dash action"
  }
]
```

---

## 10. Actions and Combat Abilities

### Weapon Attacks

**Basic Melee Attack:**
```json
"action": [
  {
    "name": "Longsword",
    "entries": [
      "{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}1d8 + 3 slashing damage (1d10 + 3 if two-handed)"
    ]
  }
]
```

**Ranged Attack:**
```json
{
  "name": "Longbow",
  "entries": [
    "{@atk rw} {@hit 5} to hit, range 150/600 ft., one target. {@h}1d8 + 2 piercing damage"
  ]
}
```

**Attack Calculation:**
- **To Hit**: Proficiency Bonus + Ability Modifier + Magic Bonus
- **Damage**: Weapon Die + Ability Modifier + Magic Bonus

### Spell Attacks

```json
{
  "name": "{@spell Eldritch Blast}",
  "entries": [
    "{@atk rs} {@hit 7} to hit, range 120 ft., one creature. {@h}{@damage 1d10 + 4} force damage"
  ]
}
```

### Special Abilities

```json
{
  "name": "Action Surge",
  "entries": [
    "On your turn, you can take one additional action on top of your regular action and a possible bonus action. Once you use this feature, you must finish a short or long rest before you can use it again."
  ]
}
```

### 5etools Formatting Tags

**Attack Tags:**
- `{@atk mw}` - Melee weapon attack
- `{@atk rw}` - Ranged weapon attack  
- `{@atk ms}` - Melee spell attack
- `{@atk rs}` - Ranged spell attack

**Damage Tags:**
- `{@damage 1d8 + 3}` - Damage roll
- `{@hit 6}` - Attack bonus
- `{@h}` - Hit indicator

**Other Tags:**
- `{@spell spell name}` - Spell link
- `{@dice 1d20 + 5}` - Generic dice roll
- `{@condition blinded}` - Condition link

---

## 11. Equipment and Inventory

### Basic Equipment

```json
"equipment": [
  {
    "name": "Longsword",
    "quantity": 1
  },
  {
    "name": "Shield",
    "quantity": 1
  },
  {
    "name": "Chain Mail",
    "quantity": 1
  }
]
```

### Detailed Equipment

```json
"equipment": [
  {
    "name": "Flame Tongue Longsword",
    "quantity": 1,
    "description": "+1 magical weapon, 2d6 fire damage when activated"
  },
  {
    "name": "Healing Potion",
    "quantity": 3,
    "description": "Regain 2d4 + 2 hit points"
  },
  {
    "name": "Rope (Hemp)",
    "quantity": 1,
    "description": "50 feet"
  }
]
```

### Currency

```json
"currency": {
  "cp": 50,     // Copper pieces
  "sp": 100,    // Silver pieces  
  "gp": 250,    // Gold pieces
  "pp": 10      // Platinum pieces
}
```

### Carrying Capacity

```json
"carryingCapacity": {
  "current": 85,
  "max": 240,     // STR × 15
  "encumbered": 160,  // STR × 10
  "heavilyEncumbered": 200  // STR × 15 - 10
}
```

---

## 12. Character Features and Traits

### Racial Traits

```json
"trait": [
  {
    "name": "Darkvision",
    "entries": [
      "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light."
    ]
  },
  {
    "name": "Dwarven Resilience", 
    "entries": [
      "You have advantage on saving throws against poison, and you have resistance against poison damage."
    ]
  }
]
```

### Class Features

```json
"trait": [
  {
    "name": "Fighting Style: Defense",
    "entries": [
      "While you are wearing armor, you gain a +1 bonus to AC."
    ]
  },
  {
    "name": "Second Wind",
    "entries": [
      "You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again."
    ]
  }
]
```

### Background Features

```json
"trait": [
  {
    "name": "Military Rank",
    "source": "background",
    "entries": [
      "You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence."
    ]
  }
]
```

---

## 13. Complete Character Examples

### Example 1: Level 5 Human Fighter

```json
{
  "character": [
    {
      "name": "Sir Marcus Ironshield",
      "source": "homebrew",
      "race": {
        "name": "Human",
        "subrace": "Variant"
      },
      "class": [
        {
          "name": "Fighter",
          "source": "PHB",
          "level": 5,
          "subclass": {
            "name": "Champion",
            "source": "PHB"
          }
        }
      ],
      "background": {
        "name": "Soldier",
        "source": "PHB"
      },
      "alignment": ["L", "G"],
      "ac": [
        {
          "ac": 19,
          "from": ["plate armor", "defense fighting style"]
        }
      ],
      "hp": {
        "current": 44,
        "max": 44,
        "temp": 0,
        "formula": "5d10 + 10"
      },
      "speed": {
        "walk": 30
      },
      "str": 16,
      "dex": 13,
      "con": 14,
      "int": 12,
      "wis": 13,
      "cha": 15,
      "save": {
        "str": "+6",
        "con": "+5"
      },
      "skill": {
        "athletics": "+6",
        "intimidation": "+5",
        "perception": "+4"
      },
      "proficiencyBonus": "+3",
      "languages": ["Common", "Orcish"],
      "hitDice": {
        "d10": {
          "max": 5,
          "current": 3
        }
      },
      "deathSaves": {
        "successes": 0,
        "failures": 0
      },
      "customTrackers": [
        {
          "name": "Action Surge",
          "type": "counter",
          "current": 0,
          "max": 1,
          "description": "Regains on short or long rest"
        },
        {
          "name": "Second Wind",
          "type": "counter",
          "current": 0,
          "max": 1,
          "description": "1d10 + 5 healing, short rest"
        },
        {
          "name": "Inspiration",
          "type": "condition",
          "active": false,
          "duration": "Until used",
          "description": "Advantage on one roll"
        }
      ],
      "action": [
        {
          "name": "Longsword (One-Handed)",
          "entries": [
            "{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}1d8 + 3 slashing damage"
          ]
        },
        {
          "name": "Longsword (Two-Handed)",
          "entries": [
            "{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}1d10 + 3 slashing damage"
          ]
        },
        {
          "name": "Handaxe (Thrown)",
          "entries": [
            "{@atk rw} {@hit 6} to hit, range 20/60 ft., one target. {@h}1d6 + 3 slashing damage"
          ]
        }
      ],
      "trait": [
        {
          "name": "Fighting Style: Defense",
          "entries": [
            "While wearing armor, you gain a +1 bonus to AC."
          ]
        },
        {
          "name": "Improved Critical",
          "entries": [
            "Your weapon attacks score a critical hit on a roll of 19 or 20."
          ]
        },
        {
          "name": "Extra Attack",
          "entries": [
            "You can attack twice, instead of once, whenever you take the Attack action on your turn."
          ]
        }
      ],
      "equipment": [
        {
          "name": "Plate Armor",
          "quantity": 1,
          "description": "AC 18, Stealth disadvantage"
        },
        {
          "name": "Shield",
          "quantity": 1,
          "description": "+2 AC"
        },
        {
          "name": "Longsword",
          "quantity": 1
        },
        {
          "name": "Handaxe",
          "quantity": 2
        },
        {
          "name": "Explorer's Pack",
          "quantity": 1
        }
      ],
      "currency": {
        "gp": 150,
        "sp": 50
      }
    }
  ]
}
```

### Example 2: Level 3 Tiefling Warlock

```json
{
  "character": [
    {
      "name": "Zara Nightwhisper",
      "source": "homebrew",
      "race": {
        "name": "Tiefling"
      },
      "class": [
        {
          "name": "Warlock",
          "source": "PHB",
          "level": 3,
          "subclass": {
            "name": "The Fiend",
            "source": "PHB"
          }
        }
      ],
      "background": {
        "name": "Folk Hero",
        "source": "PHB"
      },
      "alignment": ["C", "G"],
      "ac": [
        {
          "ac": 13,
          "from": ["leather armor", "dex"]
        }
      ],
      "hp": {
        "current": 24,
        "max": 24,
        "temp": 0
      },
      "speed": {
        "walk": 30
      },
      "str": 8,
      "dex": 14,
      "con": 15,
      "int": 13,
      "wis": 12,
      "cha": 16,
      "save": {
        "wis": "+3",
        "cha": "+5"
      },
      "skill": {
        "deception": "+5",
        "investigation": "+3",
        "arcana": "+3"
      },
      "proficiencyBonus": "+2",
      "languages": ["Common", "Infernal"],
      "hitDice": {
        "d8": {
          "max": 3,
          "current": 2
        }
      },
      "deathSaves": {
        "successes": 0,
        "failures": 0
      },
      "customTrackers": [
        {
          "name": "Dark One's Blessing",
          "type": "counter",
          "current": 1,
          "max": 1,
          "description": "Temp HP when reducing hostile to 0 HP"
        },
        {
          "name": "Pact Boon Recovery",
          "type": "counter",
          "current": 0,
          "max": 1,
          "description": "Short rest spell slot recovery"
        }
      ],
      "spells": {
        "dc": 13,
        "attackBonus": "+5",
        "ability": "Charisma",
        "levels": {
          "0": {
            "spells": ["eldritch blast", "prestidigitation", "minor illusion"]
          },
          "1": {
            "maxSlots": 0,
            "spells": ["hex", "charm person", "hellish rebuke"]
          },
          "2": {
            "maxSlots": 2,
            "slotsUsed": 0,
            "spells": ["darkness", "scorching ray"]
          }
        }
      },
      "action": [
        {
          "name": "{@spell Eldritch Blast}",
          "entries": [
            "{@atk rs} {@hit 5} to hit, range 120 ft., one creature. {@h}{@damage 1d10 + 3} force damage"
          ]
        },
        {
          "name": "Dagger",
          "entries": [
            "{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}1d4 + 2 piercing damage"
          ]
        }
      ],
      "trait": [
        {
          "name": "Darkvision",
          "entries": [
            "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light."
          ]
        },
        {
          "name": "Hellish Resistance",
          "entries": [
            "You have resistance to fire damage."
          ]
        },
        {
          "name": "Pact Magic",
          "entries": [
            "Your spellcasting uses Pact Magic instead of normal spellcasting. You regain all spell slots on a short rest."
          ]
        }
      ]
    }
  ]
}
```

---

## 14. Troubleshooting and Tips

### Common JSON Errors

**Missing Commas:**
```json
// ❌ Wrong
{
  "name": "Character"
  "level": 5
}

// ✅ Correct  
{
  "name": "Character",
  "level": 5
}
```

**Extra Commas:**
```json
// ❌ Wrong
{
  "name": "Character",
  "level": 5,
}

// ✅ Correct
{
  "name": "Character", 
  "level": 5
}
```

**Wrong Quote Types:**
```json
// ❌ Wrong - using smart quotes
{
  "name": "Character"
}

// ✅ Correct - using straight quotes
{
  "name": "Character"
}
```

### Validation Tools

**Online JSON Validators:**
- JSONLint.com
- JSONValidator.net
- Built-in VS Code validation

**Text Editors with JSON Support:**
- Visual Studio Code (free)
- Notepad++ (free)
- Sublime Text

### Performance Tips

1. **Keep spell lists reasonable** - Don't include every spell from sourcebooks
2. **Use proper data types** - Numbers for stats, strings for text
3. **Organize logically** - Group related properties together
4. **Comment your work** - JSON doesn't support comments, but use descriptive names

### Testing Your Character

1. **Start small** - Build basic character first, add features incrementally
2. **Test each section** - Validate JSON after each major addition
3. **Use examples** - Reference the complete examples above
4. **Check calculations** - Verify attack bonuses, save DCs, etc.

### Common Calculation Mistakes

**Attack Bonuses:**
- Melee: STR mod + proficiency bonus + magic bonus
- Ranged: DEX mod + proficiency bonus + magic bonus  
- Spell: Spellcasting mod + proficiency bonus

**Spell Save DC:**
- 8 + proficiency bonus + spellcasting ability modifier

**Skill Bonuses:**
- Ability modifier + proficiency bonus (if proficient)
- Double proficiency for expertise

### Getting Help

**Resources:**
- D&D 5e SRD for official rules
- 5etools community forums
- Character creation guides and builders
- JSON tutorials and validators

**Best Practices:**
- Save frequently while building
- Keep backups of working versions
- Test one feature at a time
- Use descriptive names for custom content

---

**Happy Character Creating!** 🎲

This guide should get you from zero to a complete, functional D&D 5e character in 5etools JSON format. Start with the basics and gradually add more advanced features as you become comfortable with the structure.

## 1. Basic Character Structure

Every character JSON follows this basic structure:

```json
{
  "character": [
    {
      "name": "Character Name",
      "source": "homebrew",
      "race": {
        "name": "Race Name"
      },
      "class": [
        {
          "name": "Class Name",
          "source": "PHB",
          "level": 5,
          "subclass": {
            "name": "Subclass Name",
            "source": "PHB"
          }
        }
      ],
      "alignment": ["L", "G"]
    }
  ]
}
```

### Required Fields

- **name**: Character's name (string)
- **source**: Source identifier (string) - use "homebrew" for custom characters
- **race**: Character's race information (object)
- **class**: Array of class objects (for multiclassing support)

### Optional Fields

- **alignment**: Two-letter alignment code (e.g., ["L", "G"] for Lawful Good)
- **level**: Total character level (calculated from class levels if not specified)

## 2. Core Attributes

### Ability Scores

```json
{
  "str": 16,
  "dex": 14,
  "con": 15,
  "int": 12,
  "wis": 13,
  "cha": 10
}
```

All ability scores default to 10 if not specified.

### Proficiency and Saves

```json
{
  "proficiencyBonus": "+3",
  "save": {
    "str": "+7",
    "con": "+6"
  }
}
```

- **proficiencyBonus**: Character's proficiency bonus (string with + or -)
- **save**: Object with ability abbreviations as keys, bonus values as strings

## 3. Combat Statistics

### Armor Class

```json
{
  "ac": [
    {
      "ac": 18,
      "from": ["plate armor", "shield"]
    }
  ]
}
```

### Hit Points

```json
{
  "hp": {
    "current": 45,
    "max": 52,
    "temp": 8,
    "average": 52,
    "formula": "8d8 + 16"
  }
}
```

- **current**: Current hit points (editable)
- **max**: Maximum hit points
- **temp**: Temporary hit points (editable, shows if number including 0)
- **average**: Average HP for the level (optional)
- **formula**: Hit point calculation formula (optional)

### Speed

```json
{
  "speed": {
    "walk": 30,
    "fly": 60,
    "swim": 30,
    "climb": 20
  }
}
```

## 4. Skills and Abilities

### Skills

```json
{
  "skill": {
    "perception": "+7",
    "stealth": "+6",
    "athletics": "+5"
  }
}
```

Use the exact skill names from the D&D rules. Skills not listed use base ability modifiers.

### Passive Scores

```json
{
  "passive": 17
}
```

This sets passive Perception. Other passive scores are calculated automatically.

### Languages

```json
{
  "languages": ["Common", "Elvish", "Draconic"]
}
```

## 5. Spell System

The spell system supports all caster types with flexible slot tracking.

### Basic Structure

```json
{
  "spells": {
    "dc": 15,
    "attackBonus": "+7",
    "ability": "Charisma",
    "levels": {
      "0": {
        "spells": ["cantrip1", "cantrip2"]
      },
      "1": {
        "maxSlots": 4,
        "slotsUsed": 1,
        "spells": ["spell1", "spell2"]
      }
    }
  }
}
```

### Spell Storage Options

**Simple Format:**
```json
"spells": ["eldritch blast", "fireball"]
```

**Advanced Format:**
```json
"spells": [
  "eldritch blast",
  {
    "name": "Custom Spell",
    "source": "HOMEBREW"
  }
]
```

### Caster Type Examples

**Traditional Caster (Wizard):**
```json
{
  "spells": {
    "dc": 15,
    "attackBonus": "+7", 
    "ability": "Intelligence",
    "levels": {
      "0": {
        "spells": ["mage hand", "prestidigitation"]
      },
      "1": {
        "maxSlots": 4,
        "slotsUsed": 2,
        "spells": ["magic missile", "shield"]
      },
      "2": {
        "maxSlots": 3,
        "slotsUsed": 0,
        "spells": ["misty step", "web"]
      }
    }
  }
}
```

**Warlock (Pact Magic):**
```json
{
  "spells": {
    "dc": 15,
    "attackBonus": "+7",
    "ability": "Charisma", 
    "levels": {
      "0": {
        "spells": ["eldritch blast", "prestidigitation"]
      },
      "1": {
        "maxSlots": 0,
        "spells": ["hex", "armor of agathys"]
      },
      "3": {
        "maxSlots": 2,
        "slotsUsed": 0,
        "spells": ["counterspell", "fireball"]
      }
    }
  }
}
```

### Key Features

- **Flexible Slots**: Set `maxSlots` to 0 or omit for no slot tracking
- **Cantrips**: Level 0 never shows slots
- **Click-to-Edit**: Spell slots are editable with source access
- **Auto-Sync**: Changes sync across all views

## 6. Hit Dice Tracking

Track hit dice for short rest healing.

### Single Class

```json
{
  "hitDice": {
    "d8": {
      "max": 5,
      "current": 3
    }
  }
}
```

### Multiclass

```json
{
  "hitDice": {
    "d10": {
      "max": 8,
      "current": 5
    },
    "d8": {
      "max": 3,
      "current": 2
    }
  }
}
```

- **max**: Total hit dice of this type
- **current**: Available hit dice (editable)
- Supports d4, d6, d8, d10, d12 die types
- Each die type includes clickable dice roller

## 7. Death Saves

Track death saving throws during combat.

```json
{
  "deathSaves": {
    "successes": 1,
    "failures": 0
  }
}
```

- **successes**: Success count (0-3, editable)
- **failures**: Failure count (0-3, editable)
- 3 successes = stabilized
- 3 failures = death

## 8. Custom Trackers

Flexible system for tracking abilities, items, and conditions.

### Counter Type

For limited-use abilities or items:

```json
{
  "customTrackers": [
    {
      "name": "Action Surge",
      "type": "counter",
      "current": 0,
      "max": 1,
      "description": "Regains on short or long rest"
    },
    {
      "name": "Luck Points",
      "type": "counter",
      "current": 2,
      "max": 3,
      "description": "Halfling Lucky feat"
    }
  ]
}
```

### Condition Type

For active effects, advantages, or status conditions:

```json
{
  "customTrackers": [
    {
      "name": "Advantage on Stealth",
      "type": "condition",
      "active": true,
      "duration": "1 hour",
      "description": "From Pass Without Trace"
    },
    {
      "name": "Concentration",
      "type": "condition",
      "active": false,
      "duration": "Variable",
      "description": "Currently concentrating on a spell"
    }
  ]
}
```

### Mixed Example

```json
{
  "customTrackers": [
    {
      "name": "Bardic Inspiration",
      "type": "counter",
      "current": 2,
      "max": 3,
      "description": "Charisma modifier uses per short rest"
    },
    {
      "name": "Inspiration (DM)",
      "type": "condition",
      "active": true,
      "duration": "Until used",
      "description": "Granted by DM for good roleplay"
    },
    {
      "name": "Ring of Protection",
      "type": "counter",
      "current": 1,
      "max": 3,
      "description": "Daily charges remaining"
    }
  ]
}
```

### Tracker Properties

**Required:**
- **name**: Display name for the tracker
- **type**: Either "counter" or "condition"

**Counter Type:**
- **current**: Current value (editable)
- **max**: Maximum value
- **description**: Optional description

**Condition Type:**
- **active**: Boolean status (editable)
- **duration**: Optional duration text
- **description**: Optional description

## 9. Actions and Features

### Actions

```json
{
  "action": [
    {
      "name": "Longsword",
      "entries": [
        "{@atk mw} {@hit 7} to hit, reach 5 ft., one target. {@h}1d8 + 4 slashing damage"
      ]
    },
    {
      "name": "{@spell Eldritch Blast}",
      "entries": [
        "{@atk rs} {@hit 7} to hit, range 120 ft. {@h}{@damage 1d10 + 4} force damage"
      ]
    }
  ]
}
```

### Features/Traits

```json
{
  "trait": [
    {
      "name": "Darkvision",
      "entries": [
        "You can see in dim light within 60 feet of you as if it were bright light."
      ]
    }
  ]
}
```

## 10. Equipment and Items

### Equipment List

```json
{
  "equipment": [
    {
      "name": "Longsword",
      "quantity": 1,
      "description": "+1 magical weapon"
    },
    {
      "name": "Healing Potion",
      "quantity": 3
    }
  ]
}
```

### Currency

```json
{
  "currency": {
    "cp": 50,
    "sp": 100, 
    "gp": 250,
    "pp": 10
  }
}
```

## 11. Complete Examples

### Level 5 Fighter

```json
{
  "character": [
    {
      "name": "Sir Marcus",
      "source": "homebrew",
      "race": {
        "name": "Human (Variant)"
      },
      "class": [
        {
          "name": "Fighter",
          "source": "PHB",
          "level": 5,
          "subclass": {
            "name": "Champion",
            "source": "PHB"
          }
        }
      ],
      "alignment": ["L", "G"],
      "ac": [
        {
          "ac": 18,
          "from": ["plate armor"]
        }
      ],
      "hp": {
        "current": 44,
        "max": 44,
        "temp": 0
      },
      "speed": {
        "walk": 30
      },
      "str": 16,
      "dex": 13,
      "con": 14,
      "int": 12,
      "wis": 13,
      "cha": 15,
      "save": {
        "str": "+6",
        "con": "+5"
      },
      "skill": {
        "athletics": "+6",
        "intimidation": "+5"
      },
      "proficiencyBonus": "+3",
      "hitDice": {
        "d10": {
          "max": 5,
          "current": 3
        }
      },
      "deathSaves": {
        "successes": 0,
        "failures": 0
      },
      "customTrackers": [
        {
          "name": "Action Surge",
          "type": "counter",
          "current": 0,
          "max": 1,
          "description": "Regains on short or long rest"
        },
        {
          "name": "Second Wind",
          "type": "counter",
          "current": 0,
          "max": 1,
          "description": "Regains on short or long rest"
        }
      ],
      "action": [
        {
          "name": "Longsword",
          "entries": [
            "{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}1d8 + 3 slashing damage (or 1d10 + 3 if two-handed)"
          ]
        }
      ],
      "languages": ["Common"]
    }
  ]
}
```

### Level 3 Warlock with Spells

```json
{
  "character": [
    {
      "name": "Zara Nightwhisper",
      "source": "homebrew",
      "race": {
        "name": "Tiefling"
      },
      "class": [
        {
          "name": "Warlock",
          "source": "PHB",
          "level": 3,
          "subclass": {
            "name": "Fiend",
            "source": "PHB"
          }
        }
      ],
      "alignment": ["C", "N"],
      "ac": [
        {
          "ac": 13,
          "from": ["leather armor", "dex"]
        }
      ],
      "hp": {
        "current": 24,
        "max": 24
      },
      "str": 8,
      "dex": 14,
      "con": 15,
      "int": 13,
      "wis": 12,
      "cha": 16,
      "save": {
        "wis": "+3",
        "cha": "+5"
      },
      "skill": {
        "deception": "+5",
        "investigation": "+3"
      },
      "hitDice": {
        "d8": {
          "max": 3,
          "current": 2
        }
      },
      "customTrackers": [
        {
          "name": "Dark One's Blessing",
          "type": "counter",
          "current": 1,
          "max": 1,
          "description": "Temp HP when reducing hostile to 0 HP"
        }
      ],
      "spells": {
        "dc": 13,
        "attackBonus": "+5",
        "ability": "Charisma",
        "levels": {
          "0": {
            "spells": ["eldritch blast", "prestidigitation"]
          },
          "1": {
            "maxSlots": 0,
            "spells": ["hex", "charm person"]
          },
          "2": {
            "maxSlots": 2,
            "slotsUsed": 0,
            "spells": ["darkness", "scorching ray"]
          }
        }
      },
      "languages": ["Common", "Infernal"]
    }
  ]
}
```

## 12. Best Practices

### Character Organization

1. **Use consistent naming** - Match official D&D spell and feature names
2. **Include source references** - Helps with validation and lookups
3. **Add descriptions** - Custom trackers benefit from clear descriptions
4. **Set reasonable limits** - Max values should reflect actual game limits

### Spell Management

1. **Cantrips in level 0** - Never give cantrips spell slots
2. **Known vs. Prepared** - Use the system that matches your class
3. **Pact Magic** - Set lower level slots to 0 for Warlocks
4. **Multiclass casting** - Calculate total slots correctly

### Tracker Usage

1. **Counters for resources** - Action Surge, Rage, spell slot recovery
2. **Conditions for status** - Advantage, concentration, ongoing effects
3. **Clear descriptions** - Explain what triggers resets or changes
4. **Logical grouping** - Similar abilities can be tracked together

### Performance Tips

1. **Minimize large arrays** - Don't include every possible spell
2. **Use proper data types** - Numbers for stats, strings for text
3. **Validate JSON syntax** - Use a JSON validator before importing
4. **Test incrementally** - Add features one at a time

### Common Mistakes

1. **Wrong ability score names** - Use str, dex, con, int, wis, cha
2. **Missing spell slot structure** - Always include maxSlots for tracking
3. **Invalid alignment codes** - Use two-letter codes like ["L", "G"]
4. **Incorrect save format** - Use strings with + or - signs
5. **Missing character array** - Character data must be in array format

## File Structure

Save your character as a `.json` file with this basic structure:

```json
{
  "character": [
    {
      // All character data goes here
    }
  ]
}
```

The character array allows for multiple character variants or forms in a single file.
