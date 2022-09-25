---
title: 타입스크립트에서 두 타입이 일치하는지 확인하기
date: "2022-09-25"
---

## 주제

타입스크립트에서 두 타입이 일치하는지 어떻게 확인할 수 있을까?

타입이란 할당 가능한 값의 집합이다.

집합으로 접근해본다면, A 타입과 B 타입이 있을 때, A 가 B의 부분집합이고 B가 A의 부분집합임을 나타내면 A와 B가 동일한 집합임을 보일 수 있다.

이러한 점에 근거해서 A, B 타입을 제네릭 타입으로 받는 아래와 같은 Equal1 타입을 만들어보겠다.

```ts
type Equal1<A, B> = A extends B ? (B extends A ? true : false) : false;
```

하지만 안타깝게도 이는 성립하지 않는다.

```ts
declare const test1: Equal1<boolean, false>; // test1: boolean;
```

## 근거

제네릭에서 유니언 타입은 분배법칙이 성립한다.

<https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types>

`boolean = true | false`

```ts
Equal1<boolean, false> = boolean extends false ? (false extends boolean ? true : false) : false;
      = (true | false)   extends false ? (false extends (true | false) ? true : false) : false;
      = (true extends false ? (false extends (true | false) ? true : false ) : false )
        | (false extends false ? (false extends (true | false) ? true : false ) : false )
      = false | true
      = boolean
```

따라서 A와 B가 각각 서로의 부분집합을 보이는 방법으로는 풀 수 없다는 걸 알게 되었다.

## 설명

제 3의 타입 C가 있다고 가정할 때, C가 A의 부분집합이면 C가 B의 부분집합이고, C가 A의 부분집합이 아니면 C는 B의 부분집합이 아님을 보인다면, A와 B가 동일한 집합임을 보일 수 있다.

### 수학적 증명

## 주제 반복

```ts
type Equal2<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B
  ? 1
  : 0
  ? true
  : false;
```

## Reference

<https://github.com/type-challenges/type-challenges/blob/main/utils/index.d.ts>

<https://github.com/type-challenges/type-challenges/blob/main/questions/00898-easy-includes/README.md>
