---
title: 타입스크립트에서 undefined의 쓰임새
date: "2022-08-22"
---

### 1. undefined vs null

undefined와 null은 비슷하지만 다릅니다. 동등 연산자(`==`)로 비교하면 `undefined == null // true`이며, 둘다 값이 없음을 나타낸다는 의미론적인 측면에서 유사성을 보입니다.

다만, 세부적인 측면을 살펴보면 `undefined`와 `null`의 차이를 많이 찾아볼 수 있습니다.

- `Number(undefined) === NaN` 인 반면, `Number(null) === 0` 입니다.
- 함수의 반환값을 명시하지 않으면 `undefined`가 반환됩니다.
- 함수를 호출할 때 인자를 전달하지 않으면 해당 인자는 `undefined`가 할당됩니다.
- default parameter는 속성의 값이 `undefined` 일 때만 할당됩니다. (`null` 일 때는 할당되지 않는다.)
- `let, var`로 선언한 변수의 초기값을 할당하지 않으면 `undefined`가 할당된다.

타입스크립트에서 `undefined`의 쓰임새는 극히 제한됩니다. `let`으로 선언한 변수에 초기값을 할당하지 않은 경우, `undefined`로 초기화되지만, 최근에는 대부분의 변수를 `const`로 선언하여 불변값으로 유지하기 때문에 `undefined`로 초기화되는 let 선언 변수는 안티패턴으로 간주되어 거의 볼 수 없습니다.

```ts
// 안티패턴
let num: number;
num = 3;
num = 4;

// recommended
const num = 3;
const num2 = 4;
```

### 2. undefined를 명시적으로 할당하는 경우

그럼에도 불구하고 `undefined`를 명시적으로 할당하는 경우가 프로젝트에서 꽤 있는데, 대표적으로 다음과 같은 경우를 들 수 있습니다.

#### 2.1. 객체를 JSON 직렬화 시 undefined 값을 가진 프로퍼티를 제거하기 위해

JSON의 정의에 `undefined`는 없습니다. 따라서 `JSON.stringfy({a: undefined})`를 호출하면 `a` 속성은 제거되어 `"{}"` 가 반환됩니다. 서버에 ajax 통신으로 post 요청을 보내는 경우, 특정 조건일 경우에만 body에 특정 값을 추가하여 보내고 싶은 경우에, 해당 객체의 값을 `undefined`로 할당한 후 JSON 직렬화하여 보내는 경우가 있습니다.

```ts
const memberId = isFamilyOrder ? memberId : undefined;
const body = JSON.stringify({ memberId }); // isFamillyOrder가 false인 경우에 "{}"가 된다

fetch("/api/", { method: "post", body });
```

위와 같은 목적을 달성하기 위해서 아래와 같은 코드를 보게 될 수도 있다.

```ts
const d = a?.b?.c ?? undefined; // null 을 undefined로 바꾸기 위해 사용된다.
const e = { d };
const body = JSON.stringify(e); // a?.b?.c 가 null 또는 undefined일 경우 '{}' 가 반환됩니다
```

#### 2.2. 컴포넌트 props의 타입이 optional인 경우, 값을 undefined 로 설정하여 optional을 흉내낸다

```tsx
interface Props {
  memberId?: string;
}

const Component = ({ memberId }: Props): JSX.Element => {
  return ...
};

const App = (): JSX.Element => {
  const memberId = "abcd1234";
  // ...
  return <Component memberId={isFamilyOrder ? memberId : undefined} />;
};

```

`Props`의 `memberId`속성은 optional type입니다. 즉, memberId는 존재한다면 string이고 존재하지 않을 수도 있다는 뜻입니다. 다만, 타입스크립트는 별도의 설정을 하지 않는 이상 `memberId` 속성의 값이 `undefined` 인 경우도 optional type과 동일하게 타입 세잎하다고 보기 때문에 해당 속성이 항상 존재하지만 해당 값을 `undefined`로 할당하여 optional type을 흉내낼 수 있습니다.
하지만 해당 속성에 `null`을 할당하면 이는 optional type이 아니라 `null` 값을 union으로 가지는 것과 동일하다고 봅니다.

### 3. undefined와 null을 어떻게 써야 할까요

아직 정해지지 않았다는 의미의 `undefined` 를 개발자가 직접 변수에 할당하여 변수의 값으로 정하는 것은 `undefined` 본연의 의미를 생각해볼 때 부자연스럽다고 할 수 있습니다.

#### 3.1 명시적으로 없음을 나타낼 때에는 null 을 할당한다

JSON 직렬화시에 `null`을 제거하기 위해서는 query-string 과 같은 라이브러리를 쓰는 방법도 있고, 아래와 같이 `JSON.stringify`의 두번째 인자로 replacer를 전달하여 `null`이 직렬화되는 걸 막을 수도 있습니다.

```ts
const replacer = (_: string, value: unknown): unknown =>
  value == null ? undefined : value;

export const stringify = (value: unknown): string =>
  JSON.stringify(value, replacer);
```

#### 3.2 타입을 계속 좁혀가는 방향으로 사용합니다

```ts
const add = (a: number, b: number): number => a + b;

const sum = (a: number[] | null = []): number => {
  const nums = a ?? [];

  return nums.reduce(add, 0);
};
```

예를 들어 a:string 의 '' 과 null 과 undefined가 모두 동일한 의미를 가지는가?
그렇다면 `const b = a ?? ''` 와 같이 사용해라.

#### 3.3 tsconfig의 exactOptionalPropertyTypes 설정을 true로 설정한다

undefined 값을 할당하여 optional type을 흉내내는 것은 타입체킹 시점의 타입과 실제 런타임에서의 타입을 상이하게 만듭니다. 즉, 런타임에서 객체의 해당 속성이 존재하며 값이 `undefined`이기 때문에 `in` 연산자를 통하여 객체의 속성을 검사한다면 이는 의도한 것과 다른 결과를 보입니다.

따라서 타입스크립트 4.4에 도입된 exactOptionalPropertyTypes 설정을 true로 설정하면, optional type이 정말로 객체 내에 없다는 것을 보장합니다. 즉, optional type을 사용한 값에 `undefined`를 할당하는 것을 허용하지 않습니다.
