---
title: Conditinal Type and Distributive Conditional Types
date: "2022-09-06"
---

```ts
type MakesSense = never extends never ? "yes" : "no"; // Resolves to 'yes'

type ExtendsNever<T> = [T] extends [never] ? "yes" : "no";

type MakesSenseToo = ExtendsNever<{}>; // Resolves to 'no'
type Huh = ExtendsNever<never>; // is yes
```

<https://github.com/microsoft/TypeScript/issues/31751#issuecomment-498526919>

Conditional Types
<https://www.typescriptlang.org/docs/handbook/2/conditional-types.html>

Distributive Conditional Types
<https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types>
