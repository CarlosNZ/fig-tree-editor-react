# Example expressions

Expressions for trying the editor by hand. Each one is written against the demo's registry: the core, HTTP and SQL operators, the demo's own operators (`reverse`, `changeCase`, `currentDate`) and its fragments (`getCapital`, `getFlag`), all in `demo/src/figTree.ts` and `demo/src/data/evaluatorConfig.ts`. To load one, paste it into the demo's raw-JSON editor, the ✎ on the root `expression` row. The demo collapses below two levels by default, so expand the nodes to see everything.

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
    "fallback": "Unknown"
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
    "default": "Economy",
    "useCache": false
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
| A vars block, `fallback`, `useCache`                                                | `greeting`, `capital`, `tier`                                                                           |
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
  "cachedCall": { "$getFlag": { "country": "Peru" }, "useCache": true },
  "parametersKey": { "operator": "plus", "values": [1], "parameters": {} },
  "unknown": { "operator": "flibble", "values": [1] }
}
```
