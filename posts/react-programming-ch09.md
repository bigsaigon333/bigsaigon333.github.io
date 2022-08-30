---
title: 실전 리액트 프로그래밍 09장 정적 타입 그리고 타입스크립트
date: "2022-08-27"
---

## 1. 인덱스 타입

속성 이름을 구체적으로 정의하지 않고 값의 타입만 정의하는 것

```ts
interface I {
  [key: string]: number;
}
```

## 2. 타입 호환성

어떤 타입을 다른 타입으로 취급해도 되는지 판단하는 것.
어떤 변수가 다른 변수에 할당 가능하기 위해서는 해당 변수의 타입이 다른 변수의 타입에 할당 가능해야 한다.

`타입 A가 타입 B에 할당 가능하다 = 타입 A는 타입 B의 서브타입이다`

타입은 할당 가능한 값의 집합이다. 따라서 할당 가능을 판단할 때에는 타입이 가질 수 있는 값의 집합을 생각하면 이해하기 쉽다.

### 2.1 인터페이스의 타입 호환성

인터페이스 A가 인터페이스 B로 할당 가능하려면 다음 조건을 만족해야 한다.

- B에 있는 모든 필수 속성의 이름이 A에도 존재해야 한다.
- 같은 속성 이름에 대해, A의 속성이 B의 속성에 할당 가능해야 한다.

### 2.2 함수의 타입 호환성

함수는 호출하는 시점에 문제가 없어야 할당 가능하다.

#### 2.3 함수 타입 A가 함수 타입 B로 할당 가능하기 위한 조건

(=함수 타입 A가 함수 타입B의 서브타입이기 위한 조건)

- A의 매개변수 개수가 B의 매개변수 개수보다 적어야 한다.
- 같은 위치의 매개변수에 대해 B의 매개변수가 A의 매개변수로 할당 가능해야 한다.(매개변수는 반변)
- A의 반환값은 B의 반환값으로 할당 가능하다. (반환값은 공변)

## 3. 구조적 타이핑

타입의 이름은 다르더라도 내부 구조가 같으면 같은 타입으로 취급하는 것.

```ts
interface Person {
  name: string;
  age: number;
}

interface Product {
  name: string;
  age: number;
}

const person: Person = { name: "mike", age: 23 };
const peroduct: Product = person;
```

## 4. extends, infer

### 4.1 extends

런타임의 삼항 연산자와 유사한 역할을 하는 키워드.

조건부 타입에서 사용된다. 입력된 제네릭 타입에 따라 타입을 결정할 수 있다. 어떠한 타입이 해당 타입의 서브 타입인 경우에 해당할 때와 해당하지 않을 때의 타입을 명시할 수 있다.

extends 키워드를 이용하면 제네릭 타입으로 입력할 수 있는 타입의 종류를 제한할 수 있다.

### 4.2 infer

조건부 타입을 정의할 때 extends 키워드 뒤에 사용된다.

추론된 타입을 담는 변수와 같은 역할을 수행한다.

## 5. 타입 가드

조건문을 이용해 타입의 범위를 좁히는 기능. 타입 가드를 잘 활용하면 불필요한 타입 단언(assertion) 코드를 피할 수 있으므로 생산성과 가독성이 높아진다.

- typeof 키워드
- instanceof 키워드
- in 연산자
- never type
- 식별 가능한 유니온 타입(discriminated union)
- assertion function

### 5.1 assertion function

기대하지 않은 일이 발생하면 에러를 던지는 함수를 assertion function이라고 한다. assertion function은 호출 이후의 스코프 내에서 체크하는 조건이 무엇이던지 간에 반드시 참일 것을 보장한다. assertion function은 실제로 기대되는 타입이 아닌 경우 런타임에서 에러를 방출하므로, 에러 발생시 어떻게 대처할지도 고민해야한다.(대부분은 개발자의 실수로 인한 것이겠지만)

```ts
function assertIsString(val: any): asserts val is string {
  if (typeof val !== "string") {
    throw new AssertionError("Not a string!");
  }
}

function yell(str: any) {
  assertIsString(str);

  // 이제 TypeScript는 'str'이 문자열 타입인 것을 안다
  return str.toUppercase();
  //         ~~~~~~~~~~~
  // 문자열 타입에는 toUppercase 라는 메소드가 존재하지 않으므로 에러를 방출한다.
  // (toUpperCase 메소드만 존재)
}
```

assertion function은 정의할 때 항상 명시적으로 정의해야한다.

```ts
function assertIsString(val: any): asserts val is string {
  if (typeof val !== "string") {
    throw new AssertionError("Not a string!");
  }
} // ok

const assertIsString (val: any) => asserts val is string = (val) => {
  if (typeof val !== "string") {
    throw new AssertionError("Not a string!");
  }
}; // ok

const assertIsString = (val: any): asserts val is string => {
  if (typeof val !== "string") {
    throw new AssertionError("Not a string!");
  }
}; // Assertions require every name in the call target to be declared
   // with an explicit type annotation. ts(2775)
```

<https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html?#assertion-functions>

<https://github.com/microsoft/TypeScript/pull/33622>

<https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-in-operator-narrowing>
