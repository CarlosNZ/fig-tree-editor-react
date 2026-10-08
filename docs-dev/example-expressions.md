# Example expressions

Expressions for trying the editor by hand. Each one is written against the demo's registry: the core, HTTP and SQL operators, the demo's own operators (`reverse`, `changeCase`, `currentDate`) and its fragments (`getCapital`, `getFlag`), all in `demo/src/figTree.ts` and `demo/src/data/evaluatorConfig.ts`. To load one, paste it into the demo's raw-JSON editor, the ✎ on the root `expression` row. The demo collapses below two levels by default, so expand the nodes to see everything.

## Layout check

Every block, node and display style the editor draws, in one expression, for checking layout and spacing after a styling change. Paste the data into the demo's data editor first, or its references raise sample-data warnings of their own. In the editor it has six errors and two warnings, each deliberate and all under `issues`, so the messages area has a line of each severity and every quick fix. The errors disable the root's Evaluate, but every node outside `issues` evaluates.

`issues.incomplete` is an `if` missing its `then`. Pasting it fills the `then` in without a word, since pasting is an edit. The "added" line and the highlight that fades show only when an expression arrives from outside the editor, as when a host loads it.

The data:

```json
{
  "user": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "country": "New Zealand",
    "age": 36,
    "tier": "gold",
    "banned": false,
    "trips": [
      { "city": "Wellington", "nights": 4 },
      { "city": "Lisbon", "nights": 9 }
    ]
  },
  "form": { "country": "Japan" }
}
```

The expression:

```json
{
  "//": "Every block, node and display style the editor draws, for checking layout",
  "fullNode": {
    "operator": "if",
    "condition": {
      "$and": [
        { "$greaterThan": ["$data.user.age", 17] },
        { "$not": "$data.user.banned" },
        { "operator": "!", "value": { "$equal": ["$d.user.country", "Antarctica"] } }
      ]
    },
    "then": { "$upper": "$vars.greeting" },
    "else": { "operator": "+", "values": ["Sorry, ", "$data.user.firstName"] },
    "vars": { "greeting": "Welcome aboard" },
    "fallback": "Unknown"
  },
  "namedPayload": {
    "$or": {
      "values": [
        { "$equal": ["$data.user.tier", "gold"] },
        { "$lessThan": [{ "$length": "$data.user.trips" }, 3] }
      ]
    }
  },
  "iterator": {
    "$map": {
      "input": "$data.user.trips",
      "as": "trip",
      "each": {
        "//": ["One line per trip,", "numbered from 1"],
        "$buildString": ["%1. %2", { "$plus": ["$tripIndex", 1] }, "$trip.city"]
      }
    }
  },
  "longTrips": {
    "$filter": {
      "input": "$data.user.trips",
      "each": { "$greaterThan": ["$element.nights", { "$plus": ["$index", 5] }] }
    }
  },
  "match": {
    "operator": "match",
    "value": "$data.user.tier",
    "branches": { "gold": "Lounge access", "silver": { "$literal": "{{not}} a template" } },
    "default": { "operator": "literal", "value": { "$plus": ["left", "as data"] } }
  },
  "fragments": {
    "static": { "fragment": "getCapital", "parameters": { "country": "$data.user.country" } },
    "byReference": { "fragment": "getFlag", "parameters": "$data.form" },
    "byNode": {
      "fragment": "getFlag",
      "parameters": {
        "$buildObject": [
          { "key": "country", "value": { "$changeCase": ["$data.form.country", "lower"] } }
        ]
      }
    },
    "shorthand": { "$getFlag": { "country": "Peru" }, "noCache": true }
  },
  "hostOperators": [{ "$reverse": "$data.user.lastName" }, { "operator": "currentDate" }],
  "runMarks": {
    "$plus": [{ "$divide": [1, 0], "fallback": 0 }, { "$divide": [1, 0] }],
    "fallback": -1
  },
  "plainData": {
    "number": 42,
    "decimal": 3.14,
    "boolean": true,
    "nothing": null,
    "text": "A string long enough to wrap onto a second line in a narrow editor, so its continuation can be checked against the key",
    "list": [1, "two", false],
    "emptyObject": {},
    "emptyList": []
  },
  "issues": {
    "unknownOperator": { "operator": "plsu", "values": [1, 2] },
    "strayKey": { "$plus": [1], "extra": 2 },
    "unknownKey": { "operator": "if", "condition": true, "then": "yes", "els": "no" },
    "wrongType": { "$upper": 5 },
    "bareVars": { "$lower": "$vars" },
    "unknownShorthand": { "$plsu": [1, 2] },
    "unreadVar": { "$upper": "shout", "vars": { "unused": 1 } },
    "skippedNumber": { "$buildString": ["%2 and %3", "a", "b"] },
    "incomplete": { "operator": "if", "condition": true }
  }
}
```

| Style                                                                         | Where                                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Root container, with its bar, and a comment of one line                       | the whole expression, the root's `//`                                                  |
| Full operator node, an alias, and a host operator with no parameters          | `fullNode`, `fullNode.else` (`+`) and the `!` in `fullNode.condition`, `hostOperators` |
| Shorthand: argument list, named payload, single value                         | `fullNode.condition`, `namedPayload` and `iterator`, `fullNode.then`                   |
| Node boxes as array elements: in an argument list, a named payload and data   | `fullNode.condition`, `namedPayload`, `hostOperators`                                  |
| Literal, full and shorthand                                                   | `match.default`, `match.branches.silver`                                               |
| Fragment calls: static, dynamic by reference and by node, and shorthand       | `fragments`                                                                            |
| `match` branches, `buildObject` fields                                        | `match`, `fragments.byNode`                                                            |
| Iterators, `as` bindings, `$element` and `$index`, a comment of several lines | `iterator`, `longTrips`                                                                |
| A vars block, `fallback`, `noCache`                                           | `fullNode`, `fragments.shorthand`                                                      |
| Plain data: every value type, a string that wraps, empty collections          | `plainData`                                                                            |
| Broken nodes, and error and warning tints on rows and blocks                  | `issues`                                                                               |
| Collapsed summaries, with issue counts                                        | the demo's default collapse, and `issues` collapsed                                    |
| How each node ran                                                             | after Evaluate on `fullNode` (its `else` never runs), `namedPayload` and `runMarks`    |

| Under `issues`     | In the messages area                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `unknownOperator`  | an error, with Change to plus                                            |
| `strayKey`         | an error, with Remove                                                    |
| `unknownKey`       | an error, with Rename to else and Remove                                 |
| `wrongType`        | an error, from the type check                                            |
| `bareVars`         | an error, on a reference                                                 |
| `unknownShorthand` | an error, with Rename to $plus                                           |
| `unreadVar`        | a warning                                                                |
| `skippedNumber`    | a warning, naming the unused substitution too                            |
| `incomplete`       | the "added" line, with Dismiss, when the expression arrives from outside |

`runMarks` shows the colours a failure leaves: amber on the first `$divide`, whose fallback catches it, red on the second, and amber on the `$plus`, whose fallback catches the failure the second passes up. A cancelled node needs a race between requests, as in "Every operator, at work".

## Every kind of node

Nested, and showing every node kind and row role the classification walk records. It validates with one issue, the deliberate `unknown-operator` on `broken`.

```json
{
  "//": "A travel summary for the current user",
  "title": { "$buildString": ["Welcome back, %1!", "$data.user.firstName"] },
  "greeting": {
    "operator": "if",
    "condition": { "$greaterThan": ["$data.user.visits", 10] },
    "then": { "$upper": "$vars.salutation" },
    "else": { "operator": "+", "values": ["Hello, ", "$data.user.firstName"] },
    "vars": { "salutation": "Welcome, frequent flyer" }
  },
  "capital": {
    "fragment": "getCapital",
    "parameters": { "country": "$data.user.country" },
    "fallback": "Unknown",
    "noCache": true
  },
  "flag": { "$getFlag": { "country": "$data.user.country" } },
  "flagFromForm": { "fragment": "getFlag", "parameters": "$data.form" },
  "flagFromNode": {
    "fragment": "getFlag",
    "parameters": {
      "$buildObject": [
        { "key": "country", "value": { "$changeCase": ["$data.user.country", "upper"] } }
      ]
    }
  },
  "trips": {
    "$map": {
      "input": "$data.user.trips",
      "as": "trip",
      "each": {
        "//": ["One line per trip", "numbered from 1"],
        "$buildString": {
          "template": "%1. %2 (%3 nights)",
          "substitutions": [
            { "$plus": ["$tripIndex", 1] },
            "$trip.city",
            { "$round": ["$trip.nights", 0] }
          ]
        }
      }
    }
  },
  "longTrips": {
    "$filter": {
      "input": "$data.user.trips",
      "each": { "$greaterThanOrEqual": ["$element.nights", 7] }
    }
  },
  "tier": {
    "operator": "match",
    "value": "$data.user.tier",
    "branches": { "gold": "Priority boarding", "silver": { "$literal": "Standard {{boarding}}" } },
    "default": "Economy"
  },
  "isAdult": { "$not": { "$lessThan": ["$data.user.age", 18] } },
  "noAddress": { "$not": "$data.user.address" },
  "alwaysTrue": { "$not": false },
  "template": { "operator": "literal", "value": { "$plus": ["$data.not.evaluated"] } },
  "reversedName": { "$reverse": "$data.user.lastName" },
  "details": { "total": { "$plus": ["$data.user.visits", 1] }, "note": "Plain data" },
  "broken": { "operator": "flibble", "values": [1] }
}
```

| Shape                                                                               | Where                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Root container with holes                                                           | the whole expression                                                                                    |
| Full operator, with an alias (`+`) and an unknown one                               | `greeting`, `greeting.else`, `tier`, `broken`                                                           |
| Shorthand, named payload (flattened)                                                | `trips` (`$map`), its `each` (`$buildString`), `longTrips`                                              |
| Shorthand, argument list (unlabelled)                                               | `title`, `greeting.condition`, the `$plus` and `$round` substitutions                                   |
| Shorthand, single value                                                             | `alwaysTrue` (plain), `noAddress` and `reversedName` (a reference), `isAdult` (a node), `greeting.then` |
| Fragment call, static (flattened)                                                   | `capital`                                                                                               |
| Fragment call, dynamic by reference and by node                                     | `flagFromForm`, `flagFromNode`                                                                          |
| Fragment shorthand                                                                  | `flag`                                                                                                  |
| Literal, full and shorthand                                                         | `template`, `tier.branches.silver`                                                                      |
| References: `$data`, `$vars`, `$element`, and `as` bindings (`$trip`, `$tripIndex`) | throughout, `greeting.then`, `longTrips`, `trips`                                                       |
| Comment line, and a comment of several lines                                        | the root's `//`, the `//` in `trips`' `each`                                                            |
| A vars block, `fallback`, `noCache`                                                 | `greeting`, `capital`                                                                                   |
| Host operators                                                                      | `reversedName`, and `$changeCase` in `flagFromNode`                                                     |
| `match` branches, `buildObject` fields                                              | `tier.branches`, `flagFromNode`                                                                         |
| Plain data in an evaluated position                                                 | `details`                                                                                               |

Left out, since each is an error of its own: a malformed node (`{ "operator": "plus", "fragment": "x" }`), a shorthand fragment call with dynamic arguments, and a bare `"$vars"`, which reads as an invalid reference. `$params` belongs in fragment bodies only.

## Broken nodes

One of each way a node can be broken (design, topic 7, "Where issues attach"). Each shows its name in the error colour with the issue's message, and no button. The shorthand ones keep their dashed border, in the error colour. A root key named `operator` or `fragment` would make the root itself a node, so the keys here avoid them.

```json
{
  "strayKey": { "$plus": [1], "extra": 2 },
  "twoNames": { "$plus": 1, "$minus": 2 },
  "stringPayload": { "$getFlag": "$data.x" },
  "cacheTurnedOn": { "$getFlag": { "country": "Peru" }, "noCache": false },
  "parametersKey": { "operator": "plus", "values": [1], "parameters": {} },
  "unknown": { "operator": "flibble", "values": [1] }
}
```

## Fallbacks reading `$error`

A fallback reads the failure it caught as `$error`, or `$err` (fig-tree 3.0.0-preview.10). Every `$divide` here fails with `non-finite-result`. It validates with no issues.

```json
{
  "message": { "$divide": [1, 0], "fallback": "$error.message" },
  "whole": { "$divide": [1, 0], "fallback": "$err" },
  "worded": {
    "$divide": [1, 0],
    "fallback": { "$upper": { "$plus": ["failed: ", "$error.code"] } }
  },
  "innerReads": {
    "$divide": [1, 0],
    "fallback": {
      "$plus": ["$error.code", " / ", { "$divide": [2, 0], "fallback": "$error.message" }]
    }
  },
  "givesNull": {
    "$divide": [1, 0],
    "fallback": {
      "$if": [{ "$equal": ["$error.code", "non-finite-result"] }, { "$divide": [2, 0] }, 0]
    }
  }
}
```

Each `$error` and `$err` is a reference in the binding colour, typed "Error", with no "To get node" and no ▶, and "It reads `$error`, which has a value only when its node fails" on hover. After an evaluation that ran its fallback, a ✓ shows where the ▶ would be. The ▶ of every node in a fallback that reads its fallback's `$error` (`worded`'s `$upper`, `innerReads`' `$plus`) is dimmed, with the same reason. `innerReads`' inner `$divide` reads its own fallback's `$error`, so its ▶ runs, giving the message. Each `$divide` at the top runs, its fallback giving the failure: the message, the whole failure as an object, `FAILED: NON-FINITE-RESULT`, `non-finite-result / divide – produced a non-finite number (Infinity)`. `givesNull`'s fallback reads `$error` and fails too, so its node gives null: amber, with its `$if` red.

## Every operator, at work

One expression that evaluates in full, using every operator the demo registers apart from `sql`, which needs the demo's local Postgres bridge, as well as the demo's own operators, both its fragments, and most of FigTree's grammar. Paste the data into the demo's data editor first. It validates with four warnings, each deliberate: an unread var, two contact fields for `firstOf` to pass over, and a passport number that's absent, so `get` gives its default. Evaluating the root takes about a second, making HTTP and GraphQL requests to httpbin.org, countriesnow.space and countries.trevorblades.com; a second run comes from the cache, all but `echo`, which has `noCache`.

After the root's Evaluate, the tree shows every way a node can run: green throughout, amber where a fallback caught a failure (`trips`' `$divide` for Lisbon, which has no travellers, and `safeRatio`), grey where a node never ran (`vars.unused`, `eligibility.else`, `perk`'s `default`), black for the request `race` stopped, and red for `unsafeRatio`, whose `$divide` fails the `$plus` above it and leaves a null in the root's value, as the root's card says.

The data:

```json
{
  "user": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "country": "New Zealand",
    "age": 36,
    "tier": "gold",
    "email": "  Ada.Lovelace@Example.com ",
    "tags": "maths, poetry,  engines",
    "trips": [
      {
        "city": "Wellington",
        "country": "New Zealand",
        "nights": 4,
        "cost": 820.5,
        "travellers": 2
      },
      { "city": "Lisbon", "country": "Portugal", "nights": 9, "cost": 2140, "travellers": 0 },
      { "city": "Kyoto", "country": "Japan", "nights": 6.5, "cost": 1675.25, "travellers": 3 }
    ]
  },
  "budget": 4200,
  "form": { "country": "Japan" }
}
```

The expression:

```json
{
  "//": [
    "A trip planner for the current traveller",
    "Every operator the demo registers but sql, and most of FigTree's grammar"
  ],
  "greeting": { "$buildString": "Kia ora, {{$vars.fullName}}!" },
  "email": { "$lower": { "$trim": "$data.user.email" } },
  "interests": { "$split": { "value": "$data.user.tags", "delimiter": "," } },
  "initials": {
    "$regex": { "value": "$vars.fullName", "pattern": "\\b(\\w)", "flags": "i", "mode": "match" }
  },
  "hasDigits": { "$regex": ["$data.user.email", "\\d"] },
  "domain": {
    "operator": "regex",
    "value": "$data.user.email",
    "pattern": "(?<=@)[\\w.]+",
    "mode": "extract",
    "noMatchDefault": "no domain"
  },
  "nameBackwards": { "$reverse": "$d.user.firstName" },
  "shouting": { "$changeCase": ["$data.user.lastName", "upper"] },
  "today": { "operator": "currentDate" },
  "stats": {
    "vars": { "nights": { "operator": "map", "input": "$vars.trips", "each": "$element.nights" } },
    "totalNights": { "operator": "+", "values": "$vars.nights" },
    "roundedUp": { "$ceil": { "$plus": "$vars.nights" } },
    "longest": { "$max": "$vars.nights" },
    "shortest": { "$min": "$vars.nights" },
    "average": {
      "$round": [{ "$divide": [{ "$plus": "$vars.nights" }, { "$length": "$vars.nights" }] }, 1]
    },
    "oddTotal": { "$modulo": [{ "$floor": { "$plus": "$vars.nights" } }, 2] },
    "tripsSquared": { "$power": [{ "$length": "$vars.trips" }, 2] },
    "overBudget": { "$abs": { "$subtract": [5000, { "$multiply": ["$data.budget", 1.1] }] } }
  },
  "trips": {
    "$map": {
      "input": "$vars.trips",
      "as": "trip",
      "each": {
        "//": "One line per trip, numbered from 1",
        "vars": {
          "perPerson": { "$divide": ["$trip.cost", "$trip.travellers"], "fallback": "$trip.cost" }
        },
        "$buildString": {
          "template": "%1. %2 %3: %4 nights, $%5 each",
          "substitutions": [
            { "$plus": ["$tripIndex", 1] },
            "$trip.city",
            { "$getFlag": { "country": "$trip.country" } },
            { "$convert": ["$trip.nights", "string"] },
            { "$round": ["$vars.perPerson", 2] }
          ]
        }
      }
    }
  },
  "longTrips": {
    "$filter": {
      "input": "$vars.trips",
      "each": { "operator": ">=", "values": ["$element.nights", 7] }
    }
  },
  "firstAbroad": {
    "operator": "find",
    "input": "$vars.trips",
    "each": { "$notEqual": ["$element.country", "$data.user.country"] },
    "noMatchDefault": "Stayed home"
  },
  "anyFree": { "$some": { "input": "$vars.trips", "each": { "$equal": ["$element.cost", 0] } } },
  "allBooked": {
    "$every": {
      "input": "$vars.trips",
      "each": { "$or": [{ "$equal": ["$index", 99] }, { "$lessThan": [0, "$element.nights"] }] }
    }
  },
  "cheaperThan": {
    "$map": {
      "input": "$vars.trips",
      "as": "from",
      "each": {
        "$map": {
          "input": "$vars.trips",
          "as": "to",
          "each": { "$lessThanOrEqual": ["$from.cost", "$to.cost"] }
        }
      }
    }
  },
  "eligibility": {
    "operator": "if",
    "condition": {
      "$and": [
        { "$greaterThanOrEqual": ["$d.user.age", 18] },
        {
          "$or": [
            { "$equal": ["$data.user.tier", "gold"] },
            { "$greaterThan": [{ "$length": "$vars.trips" }, 5] }
          ]
        },
        { "operator": "!", "value": { "$equal": ["$data.user.country", "Antarctica"] } }
      ]
    },
    "then": { "$upper": "lounge access" },
    "else": { "$lower": "Standard check-in" }
  },
  "perk": {
    "operator": "match",
    "value": "$data.user.tier",
    "branches": {
      "gold": { "$buildString": ["%1 extra kg of luggage", { "$multiply": [5, 2] }] },
      "silver": "Priority boarding"
    },
    "default": { "$literal": "Standard {{allowance}}" }
  },
  "contact": {
    "$firstOf": ["$data.user.phone", "$data.user.mobile", { "$trim": "$data.user.email" }, "none"]
  },
  "home": {
    "operator": "get",
    "path": "trips[0].city",
    "from": "$data.user",
    "default": "nowhere"
  },
  "passport": { "$get": ["user.passport.number", "not on file"] },
  "card": {
    "$buildObject": [
      { "key": "name", "value": "$vars.fullName" },
      { "key": { "$lower": "COUNTRY" }, "value": "$data.user.country" },
      { "key": "since", "value": { "$convert": ["2016", "number"] } }
    ]
  },
  "capital": {
    "fragment": "getCapital",
    "parameters": { "country": "$data.user.country" },
    "fallback": "Unknown"
  },
  "flagFromForm": { "fragment": "getFlag", "parameters": "$data.form" },
  "flagFromNode": {
    "fragment": "getFlag",
    "parameters": {
      "$buildObject": [
        { "key": "country", "value": { "$changeCase": ["$data.form.country", "lower"] } }
      ]
    }
  },
  "echo": {
    "operator": "http",
    "url": "https://httpbin.org/get",
    "query": { "city": "$data.user.trips[1].city" },
    "returnPath": "args.city",
    "timeout": 5000,
    "noCache": true
  },
  "country": {
    "operator": "graphQL",
    "url": "https://countries.trevorblades.com/",
    "query": "query getCountry($code: ID!) { country(code: $code) { name capital currency } }",
    "variables": { "code": "NZ" },
    "returnPath": "country",
    "fallback": { "error": "Countries API unavailable" }
  },
  "race": {
    "$or": [
      { "operator": "http", "url": "https://httpbin.org/delay/3" },
      { "operator": "http", "url": "https://httpbin.org/get", "returnPath": "url" }
    ]
  },
  "safeRatio": { "$divide": [1, 0], "fallback": 0 },
  "unsafeRatio": { "$plus": [{ "$divide": ["$data.budget", 0] }, 1] },
  "template": { "operator": "literal", "value": { "$plus": ["not", "evaluated"] } },
  "note": "Plain data beside the nodes, returned as it is",
  "vars": {
    "traveller": "$data.user",
    "trips": "$vars.traveller.trips",
    "fullName": { "$join": ["$vars.traveller.firstName", "$vars.traveller.lastName"] },
    "unused": { "$upper": "never read" }
  }
}
```

| Operators                                                                                                                   | Where                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Logic: `and`, `or`, `not` (as `!`), `if`, `match`, `firstOf`                                                                | `eligibility`, `allBooked`, `race`, `perk`, `contact`                                         |
| Comparison: `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual` (and `>=`), `lessThan`, `lessThanOrEqual`              | `eligibility`, `anyFree`, `firstAbroad`, `longTrips`, `allBooked`, `cheaperThan`              |
| Maths: `plus` (and `+`), `subtract`, `multiply`, `divide`, `modulo`, `power`, `round`, `floor`, `ceil`, `abs`, `min`, `max` | `stats`, `trips`, `safeRatio`, `unsafeRatio`                                                  |
| Strings: `buildString`, `split`, `join`, `lower`, `upper`, `trim`, `regex` in each of its modes                             | `greeting`, `trips`, `interests`, `vars.fullName`, `email`, `hasDigits`, `domain`, `initials` |
| Arrays: `length`, `map`, `filter`, `find`, `some`, `every`                                                                  | `stats`, `trips`, `longTrips`, `firstAbroad`, `anyFree`, `allBooked`, `cheaperThan`           |
| Data and conversion: `get`, `buildObject`, `convert`                                                                        | `home`, `passport`, `card`, `flagFromNode`, `trips`                                           |
| I/O: `http`, `graphQL`                                                                                                      | `echo`, `race`, `country`, and both fragments' bodies                                         |
| The demo's own: `reverse`, `changeCase`, `currentDate`                                                                      | `nameBackwards`, `shouting`, `flagFromNode`, `today`                                          |
| Fragments: `getCapital`, `getFlag`, full and shorthand, with static and dynamic arguments                                   | `capital`, `trips`, `flagFromForm`, `flagFromNode`                                            |
| `literal`, full and shorthand                                                                                               | `template`, `perk`'s `default`                                                                |

| Feature                                                                                                     | Where                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `vars`: on the root, one reading another, one never read, on a plain object, on a node inside an iterator   | `vars`, `vars.trips`, `vars.unused`, `stats`, `trips`' `each`                |
| References: `$data` and its alias `$d`, `$vars`, `$element`, `$index`, `as` names, and tokens in a template | throughout, `nameBackwards`, `allBooked`, `trips`, `cheaperThan`, `greeting` |
| Forms: full, shorthand with an argument list, a named payload or a single value, and aliases                | throughout                                                                   |
| Nested iterators, each with its own `as`                                                                    | `cheaperThan`                                                                |
| `fallback` on a node, on a request, on a fragment call, and catching for one element of an iterator         | `safeRatio`, `country`, `capital`, `trips`                                   |
| `noCache`, and the instance's cache on a second run                                                         | `echo`, which is never cached, and the fragments in `trips`                  |
| Comments of one line and of several                                                                         | `trips`' `each`, the root                                                    |
| Lazy evaluation: an untaken branch, unchosen `match` branches, `firstOf` stopping at its first value        | `eligibility`, `perk`, `contact`                                             |
| A race stopping the slower request                                                                          | `race`                                                                       |
| A failure failing the node above it, leaving a null in the root                                             | `unsafeRatio`                                                                |
| Defaults: `noMatchDefault` and `get`'s `default`                                                            | `firstAbroad`, `domain`, `home`, `passport`                                  |
| Plain data, and `literal` content left unevaluated                                                          | `note`, `template`                                                           |

## The mother of all expressions

After fig-tree's v2 test of the same name (`test/V2/17_complexExpressions.test.ts`), and in the same spirit: a `buildString` at the root whose twenty named tokens each come from a tree of their own, most of them drawing on vars that draw on each other. It evaluates to the opening crawl of a space opera. It uses every operator the demo registers apart from `sql`, which needs the demo's local Postgres bridge, as well as the demo's own operators, both its fragments and `literal`. Paste the data into the demo's data editor first. It validates with no issues, and evaluating the root takes about a second, making requests to countries.trevorblades.com, countriesnow.space and httpbin.org; a second run takes about half that, from the cache, all but the race, which has `noCache`.

The data:

```json
{
  "library": "fig-tree-evaluator",
  "transmission": {
    "from": "  rebel COMMAND ",
    "sent": "1843-09-01",
    "meetAt": "beneath the Nikau palms, by the Zealandia gate",
    "cipher": "enignE lluN eht rof snalp eht"
  },
  "rebels": [
    {
      "name": "Ada Lovelace",
      "role": "engineer",
      "rank": 3,
      "droid": false,
      "country": "United Kingdom",
      "credits": "1843.50",
      "skills": ["maths", "poetry"]
    },
    {
      "name": "Alan Turing",
      "role": "codebreaker",
      "rank": 4,
      "droid": false,
      "country": "Bletchley Park",
      "credits": "1936",
      "skills": ["ciphers", "marathons"]
    },
    {
      "name": "Grace Hopper",
      "role": "admiral",
      "rank": 9,
      "droid": false,
      "country": "United States",
      "credits": "1959.25",
      "skills": ["compilers", "nanoseconds", "maths"]
    },
    {
      "name": "Katherine Johnson",
      "role": "navigator",
      "rank": 5,
      "droid": false,
      "country": "United States",
      "credits": "plenty",
      "skills": ["orbits"]
    },
    {
      "name": "Unit K-0",
      "serial": "k-0",
      "callsign": null,
      "role": "droid",
      "rank": 0,
      "droid": true,
      "country": null,
      "credits": "0",
      "skills": ["shields"]
    }
  ],
  "empire": { "name": null, "fleet": { "position": 31.2 } },
  "ship": { "name": "Analytical Engine", "cloaked": false, "position": 42.7, "heading": "Tau Ceti" }
}
```

The expression:

```json
{
  "//": [
    "The opening crawl of a space opera, every word of it computed",
    "Paste the data into the demo's data editor first"
  ],
  "operator": "buildString",
  "template": "EPISODE {{episode}}\n{{title}}\n\nIt is the year {{year}}. The {{empire}} has seized every database in the galaxy, and its agents roam the network, turning good values into null.\n\nFrom a hidden base in {{capital}} {{flag}}, a band of {{band}} rebels led by {{leader}} has intercepted {{transmission}}. Decoded, it reveals {{secret}}.\n\n{{crew}} make up the rest of the crew. What they know that their leader doesn't: {{skills}}. They have {{funds}} between them, {{share}} each, and a droid called {{droid}} to keep the shields up.\n\n{{course}} the {{cloak}} {{$d.ship.name}} races towards {{destination}}, with the {{empire}}'s fleet {{pursuit}}...\n\n{{signoff}}",
  "substitutions": {
    "episode": {
      "operator": "match",
      "value": {
        "$modulo": [{ "operator": "^", "base": 2, "exponent": { "$length": "$vars.crew" } }, 12]
      },
      "branches": { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI" },
      "default": {
        "$buildString": ["%1 (in production)", { "$power": [2, { "$length": "$vars.crew" }] }]
      }
    },
    "title": {
      "$upper": {
        "$buildString": [
          "A New %1",
          { "$get": { "path": "[1]", "from": { "$split": ["$d.library", "-"] } } }
        ]
      }
    },
    "year": {
      "//": "A thousand years from today",
      "operator": "+",
      "values": [
        {
          "$convert": [
            {
              "$regex": {
                "value": { "operator": "currentDate" },
                "pattern": "\\d{4}",
                "mode": "extract"
              }
            },
            "number"
          ]
        },
        { "operator": "*", "values": [10, 10, 10] }
      ]
    },
    "empire": {
      "$buildString": {
        "template": "%1 Empire",
        "substitutions": ["$d.empire.name"],
        "nullValueDefault": "Null"
      }
    },
    "capital": {
      "fragment": "getCapital",
      "parameters": "$vars.place",
      "fallback": "a place nobody can find"
    },
    "flag": {
      "fragment": "getFlag",
      "parameters": { "$buildObject": [{ "key": "country", "value": "$vars.country.name" }] }
    },
    "band": {
      "$join": [
        {
          "$get": {
            "path": [{ "$length": "$v.crew" }],
            "from": ["no", "one", "two", "three", "four", "five", "six"]
          }
        },
        {
          "operator": "?",
          "condition": {
            "$every": {
              "input": "$vars.crew",
              "each": { "operator": ">", "values": [{ "$length": "$element.skills" }, 0] }
            }
          },
          "then": "skilled",
          "else": "ragtag"
        }
      ]
    },
    "leader": {
      "$buildString": [
        "%1 %2",
        {
          "//": "The role, capitalised",
          "operator": "+",
          "values": [
            {
              "$changeCase": [
                { "$regex": { "value": "$vars.leader.role", "pattern": "^.", "mode": "extract" } },
                "upper"
              ]
            },
            {
              "$regex": { "value": "$vars.leader.role", "pattern": "(?<=^.).*", "mode": "extract" }
            }
          ],
          "expect": "string"
        },
        "$vars.leader.name"
      ]
    },
    "transmission": {
      "operator": "if",
      "condition": {
        "$and": [
          {
            "$equal": {
              "values": [{ "$trim": "$d.transmission.from" }, "rebel command"],
              "caseInsensitive": true
            }
          },
          { "$regex": ["$d.transmission.sent", "^\\d{4}-\\d{2}-\\d{2}$"] }
        ]
      },
      "then": {
        "$buildString": [
          "a transmission from %1",
          {
            "$join": {
              "$map": {
                "input": { "$split": [{ "$trim": "$d.transmission.from" }, " "] },
                "each": {
                  "//": "Title case: the first letter upper, the rest lower",
                  "$plus": [
                    {
                      "$upper": {
                        "$get": { "path": "[0]", "from": { "$split": [{ "$lower": "$word" }, ""] } }
                      }
                    },
                    {
                      "$join": {
                        "values": {
                          "$filter": {
                            "input": { "$split": [{ "$lower": "$word" }, ""] },
                            "each": { "operator": ">", "values": ["$i", 0] }
                          }
                        },
                        "delimiter": ""
                      }
                    }
                  ]
                },
                "as": "word"
              }
            }
          }
        ]
      },
      "else": "a transmission nobody can read"
    },
    "secret": {
      "$join": {
        "$map": {
          "input": { "$reverse": { "$split": ["$data.transmission.cipher", " "] } },
          "each": { "$reverse": "$glyph" },
          "as": "glyph"
        }
      }
    },
    "crew": {
      "operator": "+",
      "values": [
        {
          "$join": {
            "values": {
              "$filter": {
                "input": "$vars.lines",
                "each": {
                  "operator": "<",
                  "values": ["$index", { "$subtract": [{ "$length": "$vars.lines" }, 1] }]
                }
              }
            },
            "delimiter": ", "
          }
        },
        " and ",
        { "$get": { "path": "[0]", "from": { "$reverse": "$vars.lines" } } }
      ],
      "vars": {
        "lines": {
          "$map": {
            "input": "$vars.others",
            "each": {
              "$buildString": [
                "%1 %2 the %3",
                "$rebel.name",
                { "$getFlag": { "country": "$rebel.country" }, "fallback": "🏳️" },
                "$rebel.role"
              ]
            },
            "as": "rebel"
          }
        }
      }
    },
    "skills": {
      "$join": {
        "values": {
          "$map": {
            "input": "$vars.others",
            "each": {
              "$buildString": [
                "%1's %2",
                { "$get": { "path": "[0]", "from": { "$split": ["$member.name", " "] } } },
                {
                  "$join": {
                    "values": {
                      "$filter": {
                        "input": "$member.skills",
                        "each": {
                          "$not": {
                            "$some": {
                              "input": "$vars.leader.skills",
                              "each": { "$equal": ["$e", "$skill"] }
                            }
                          }
                        },
                        "as": "skill"
                      }
                    },
                    "delimiter": " and "
                  }
                }
              ]
            },
            "as": "member"
          }
        },
        "delimiter": ", "
      }
    },
    "funds": { "$buildString": ["%1 %2", "$vars.funds", "$vars.country.currency"] },
    "share": {
      "$buildString": [
        "%1 %2",
        {
          "$floor": { "operator": "/", "value": "$vars.funds", "by": { "$length": "$vars.crew" } }
        },
        "$vars.country.currency"
      ]
    },
    "droid": {
      "$firstOf": [
        "$vars.droid.callsign",
        { "$upper": "$vars.droid.serial" },
        { "$buildString": ["unit %1", { "$plus": ["$vars.droid.rank", 1] }] }
      ]
    },
    "course": {
      "operator": "?",
      "condition": {
        "$some": { "input": "$vars.crew", "each": { "$equal": ["$e.role", "navigator"] } }
      },
      "then": {
        "$buildString": [
          "With %1 at the helm,",
          {
            "$get": {
              "path": "name",
              "default": "nobody",
              "from": {
                "$find": {
                  "input": "$vars.crew",
                  "each": { "operator": "=", "values": ["$member.role", "navigator"] },
                  "as": "member"
                }
              }
            }
          }
        ]
      },
      "else": "Drifting blind,"
    },
    "cloak": { "operator": "?", "condition": "$d.ship.cloaked", "then": "cloaked", "else": "" },
    "destination": {
      "//": "Whichever request answers first is enough to show the network is up",
      "operator": "if",
      "condition": {
        "$or": [
          { "operator": "http", "url": "https://httpbin.org/delay/3", "returnPath": "url" },
          { "operator": "http", "url": "https://httpbin.org/get", "returnPath": "url" }
        ],
        "noCache": true
      },
      "then": {
        "operator": "http",
        "url": "https://httpbin.org/anything",
        "method": "post",
        "query": { "code": "$vars.code" },
        "body": { "heading": "$d.ship.heading", "crew": { "$length": "$vars.crew" } },
        "returnPath": "json.heading",
        "timeout": 5000
      },
      "else": "the nearest moon"
    },
    "pursuit": {
      "operator": "if",
      "condition": { "operator": "<=", "values": ["$vars.gap", 20] },
      "then": { "$buildString": ["only %1 parsecs behind", "$vars.gap"] },
      "else": "far behind",
      "vars": {
        "gap": {
          "$min": [
            {
              "$ceil": {
                "$abs": {
                  "operator": "-",
                  "value": "$d.empire.fleet.position",
                  "minus": "$d.ship.position"
                }
              }
            },
            99
          ]
        }
      }
    },
    "signoff": {
      "//": "The literal keeps its content as data, so this upper never runs",
      "$get": {
        "path": "value",
        "from": { "$literal": { "operator": "upper", "value": "To be continued…" } }
      }
    }
  },
  "closeGaps": true,
  "vars": {
    "code": {
      "//": "The capitals in the meeting place spell the base's country code",
      "$join": {
        "values": {
          "$regex": { "value": "$d.transmission.meetAt", "pattern": "[A-Z]", "mode": "match" }
        },
        "delimiter": ""
      }
    },
    "country": {
      "operator": "graphQL",
      "query": "query base($code: ID!) { country(code: $code) { name currency } }",
      "variables": { "$buildObject": [{ "key": { "$lower": "CODE" }, "value": "$vars.code" }] },
      "url": "https://countries.trevorblades.com/",
      "returnPath": "country",
      "fallback": { "name": "New Zealand", "currency": "NZD" }
    },
    "place": { "country": "$vars.country.name" },
    "crew": {
      "$filter": {
        "input": "$d.rebels",
        "each": {
          "$and": [
            { "operator": "!", "value": "$e.droid" },
            { "operator": ">=", "values": ["$e.rank", 1] }
          ]
        }
      }
    },
    "leader": {
      "$find": {
        "input": "$vars.crew",
        "each": { "$equal": ["$e.rank", { "$max": "$d.rebels[*].rank" }] },
        "noMatchDefault": { "name": "nobody", "role": "nobody" }
      }
    },
    "others": {
      "$filter": {
        "input": "$vars.crew",
        "each": { "operator": "!=", "values": ["$e.name", "$vars.leader.name"] }
      }
    },
    "droid": { "$find": { "input": "$d.rebels", "each": "$e.droid" } },
    "funds": {
      "$round": [
        {
          "$plus": {
            "$map": {
              "input": "$vars.crew",
              "each": { "$convert": ["$e.credits", "number"], "fallback": 0 }
            }
          }
        },
        2
      ]
    }
  }
}
```

The result, evaluated in 2026:

```text
EPISODE IV
A NEW TREE

It is the year 3026. The Null Empire has seized every database in the galaxy, and its agents roam the network, turning good values into null.

From a hidden base in Wellington 🇳🇿, a band of four skilled rebels led by Admiral Grace Hopper has intercepted a transmission from Rebel Command. Decoded, it reveals the plans for the Null Engine.

Ada Lovelace 🇬🇧 the engineer, Alan Turing 🏳️ the codebreaker and Katherine Johnson 🇺🇸 the navigator make up the rest of the crew. What they know that their leader doesn't: Ada's poetry, Alan's ciphers and marathons, Katherine's orbits. They have 5738.75 NZD between them, 1434 NZD each, and a droid called K-0 to keep the shields up.

With Katherine Johnson at the helm, the Analytical Engine races towards Tau Ceti, with the Null Empire's fleet only 12 parsecs behind...

To be continued…
```

| Token              | How it's made                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `episode`          | 2 to the power of the crew's size, modulo 12, matched to a Roman numeral                                                                                                                 |
| `title`            | the second piece of `library` split on `-`, built into "A New …" and upper-cased                                                                                                         |
| `year`             | the year that `regex` extracts from `currentDate`, converted to a number, plus 10 × 10 × 10                                                                                              |
| `empire`           | the empire's name, which is null, so `nullValueDefault` stands in                                                                                                                        |
| `capital`          | `getCapital`, its arguments by reference to `vars.place`, which holds the country the GraphQL query found for `vars.code`                                                                |
| `flag`             | `getFlag`, its arguments built by `buildObject`                                                                                                                                          |
| `band`             | the crew's size as a word, read by a `get` whose path is computed, and "skilled" where `every` member has a skill                                                                        |
| `leader`           | the crew member whose rank is the `max` of every rebel's (a `[*]` projection), with their role capitalised by two `regex` extracts, `changeCase` and `+`                                 |
| `transmission`     | an `and` of a case-insensitive `equal` and a `regex` test, then each word title-cased: `split` into code points, the first upper-cased and the rest kept by a `filter` on `$i`           |
| `secret`           | the cipher's words in reverse order, each one reversed                                                                                                                                   |
| `crew`             | a line per member but the leader, from a vars block on the node, each with a `getFlag` call whose fallback catches Bletchley Park's 404, joined with commas and an "and" before the last |
| `skills`           | three iterators deep: each member's skills that none of the leader's equal                                                                                                               |
| `funds`, `share`   | the crew's credits converted to numbers, with a fallback of 0 for one that isn't, summed and rounded; the share `floor`ed; the currency from the GraphQL query                           |
| `droid`            | `firstOf` the droid's callsign, which is null, its serial upper-cased, and a name that's never built                                                                                     |
| `course`           | whether `some` member is a navigator, then the one `find` finds                                                                                                                          |
| `cloak`            | empty, since the ship isn't cloaked, and `closeGaps` takes the space before it                                                                                                           |
| `{{$d.ship.name}}` | a reference token in the template                                                                                                                                                        |
| `destination`      | an `or` racing two requests, made afresh on every run by its `noCache`, where the first to answer lets it go on to a POST that httpbin echoes back                                       |
| `pursuit`          | the gap between the ships, from a vars block on the node, by `-`, `abs`, `ceil` and `min`                                                                                                |
| `signoff`          | read by `get` from a `literal`, whose `upper` node is data, so it never runs                                                                                                             |

The root's vars: `code` spells the base's country code from the capitals in `meetAt` (`regex` in match mode), `country` asks GraphQL for it with a `buildObject` whose key is computed, `crew` filters out the droid, and `leader`, `others` and `funds` each read `crew`.

After the root's Evaluate, the tree is green but for an amber `convert` in `funds`, for Katherine's credits of "plenty"; grey where a node never ran (`episode`'s default, `droid`'s third candidate, every branch not taken); and black for the `delay/3` request that `destination`'s `or` stops. Alan's `getFlag` caught a 404 but shows green, since fig-tree's trace records a fragment call whose fallback answered as `value`: `src/evaluate/fragment.ts` doesn't call `markFallback` as `src/evaluate/operator.ts` does.
