---
title: Ch04. 해시테이블
date: "2020-03-13"
summary: "해시테이블: 객체, Map, Set"
---

배열에서는 특정 값을 탐색하기 위해서는 O(N)이 소요되었다.
데이터를 O(1) 만에 탐색할 수 있는 해시 테이블이라는 특수한 자료 구조의 사용법에 대해서 알아보자.

## 4-1. 해시테이블이란?

해시테이블은 키와 값의 쌍으로 이루어진 리스트이다. 해시테이블은 다양한 프로그래밍 언어에서 서로 다른 이름으로 불린다. 해시, 맵, 해시 맵, 딕셔너리, 연관 배열 등

해시테이블은 키를 알고 있다면 O(1)으로 해당하는 값에 접근할 수 있다는 특징이 있다.

```js
{
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000
}
```

pencil 이라는 키를 알고 있다면 pencil의 가격인 1000원을 바로 알 수 있다.

어떻게 가능한 것일까?
배열은 인덱스 값을 알고 있다면 인덱스에 위치한 값을 O(1)으로 접근할 수 있다.

따라서 각각의 키를 일정한 규칙에 따라 고유한 인덱스로 변환시킨 후 이를 배열에 저장하는 방식으로 구현할 수 있다.

입력값인 키를 유일한 인덱스로 변환하는 함수를 해시 함수라고 부른다.
해시 함수에는 다양한 방법이 존재할 수 있다.

예를 들어, a = 1, b = 2, c = 3 ... 으로 설정한 후 문자를 숫자로 바꾼 후 각각을 더한 값을 한다.
pen 은 p = 16 e = 5 n = 14 = > 16 + 5 + 14 = 35 이다

매우 큰 배열에 인덱스가 35인 위치에 값을 1500으로 한다.

hash['pen'] => hash[35] => 1500

이렇게 접근할 수 있을 것이다.

눈치가 빠르신 분들은 이미 아셨겠지만, 각 자리수의 합이 35가 나올 수 있는 경우는 매우 많다.

예를 들면 'algo' 또한 35이다.

이렇게 키를 해싱한 값이 중복되는 경우를 충돌(Collision)이라고 한다.

해시 함수가 유효하려면 딱 한 가지 기준을 충족해야 하는데, 동일한 문자열을 해시 함수에 적용할 때마다 항상 동일한 숫자로 변환해야 한다.

난수나 현재 시간을 계산에 넣어서 사용하는 해시 함수는 유효하지 않다.

'pen'을 언제 몇번을 넣더라도 항상 35로 변환되어야 한다는 뜻이다.

### 충돌 해결

충돌을 해결하기 위한 방법이 많이 있다. 고전적인 방법인 분리 연결법, 개방 주소법 등등.

다만, 대부분의 프로그래밍 언어에서 해시 테이블을 구현할 때 이를 대신 처리한다. 가장 최선의 방법으로 해결해놓았다. 코딩테스트를 푸는 입장에서는 어떻게 이러한 해시테이블을 사용할지에 조금더 초점을 맞추겠다. 어떤 충돌해결방법이 있는지는 기본적인 컴퓨터 지식이므로 각자 공부하셔야 한다. 면접 때 당연히 물어볼 수 있다. 프론트엔드에서는 잘 안물어보긴 하더라...

### 단방향 룩업

해시 테이블에서 한 단계만에 값을 찾는 기능은 그 값의 키를 알 때만 가능하다.
키를 모른 채 값을 찾으려면 해시 테이블 내 모든 키/값 쌍을 검색하는 수밖에 없고 이는 O(N)이다.
키를 사용해 값을 찾을 때만 O(1) 룩업이 가능하고, 거꾸로 값을 이용해 연관된 키를 찾을 때는 해시 테이블의 빠른 룩업 기능을 활용할 수 없다.

각 키는 해시 테이블에 딱 하나만 존재할 수 있으나 동일한 값은 여러개 존재할 수 있다.

pencil의 가격은 유일하게 1500원이지만, 1500원짜리인 사무용품은 pencil외에도 있을 수 있다.

대부분의 언어에서 이미 존재하는 키에 키/값 쌍을 저장하려 하면 키는 그대로 두고 기존 값만 덮어쓴다.

## 4-2. 자바스크립트에서의 해시 테이블

해시 테이블의 구현체로 가장 단순한 것이 **객체**입니다.

자바스크립트의 참조타입인 객체는 키와 값의 쌍으로 구성된 프로퍼티의 컬렉션입니다.

프로퍼티 키를 알고 있다면 값에 O(1)으로 접근이 가능합니다.

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
};
```

### 키 값을 통해 값에 접근하는 방법

1. dot notation(점 표기법)
2. bracket notation(대괄호 표기법)

#### 점 표기법

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
};

officeSupplies.pencil; // 1000
officeSupplies.pen; // 1500
officeSupplies.water; // undefined
```

존재하지 않는 키로 접근하면 undefined 가 반환됩니다.

#### 대괄호 표기법

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
};

officeSupplies["pencil"]; // 1000
officeSupplies["pen"]; // 1500

const name = "note";
officeSupplies[name]; // 2000

officeSupplies["ru" + "ler"]; // 1200
officeSupplies["-"]; // undefined
```

대괄호 안에는 어떠한 표현식도 올 수 있습니다. 따라서 변수도 사용할 수 있습니다. "-" 와 같은 일부 기호는 자바스크립트에서 유효한 식별자가 아니기 때문에 점 표기법으로는 나타낼 수 없습니다. 그럴 때는 반드시 대괄호 연산자를 사용하여야 합니다.

### 객체에 해당 키가 존재하는지 확인하는 방법

많은 분들이 해당 키의 값이 undefined 인지 확인하는 방법을 쓰곤 합니다.

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
};

officeSupplies.apple; // undefined
```

그런데 만약에 "apple"의 값이 undefined 이면 어떨까요?

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
  apple: undefined,
};

officeSupplies.apple; // undefined
```

값이 undefined 인 경우와 키가 존재하는지는 다른 경우이지만, 이렇게 확인하는 경우 정확하게 구분할 수가 없습니다.

또는 이를 boolean context에 사용하는 경우가 있습니다.

```js
if (!officeSupplies.coffee) {
  // 사무용품에 커피가 없다면...

  console.log("커피도 판매해주세요");
}
```

그런데 coffee의 가격이 0원이었다면?
즉, 0이라는 값이 암묵적으로 false로 변환되고 ! 연산자로 인해 true로 변환되어...

의외로 많이 발생하는 케이스입니다.
0, "", NaN 은 암묵적으로 false로 변환됩니다.

코딩테스트에서는 주로 문자열과 숫자를 다루는데, 0과 "" 이 값인 경우에 어떻게 처리할 것인지를 명확하게 나누지 않고 암묵적 형변환을 하면 이런 상황에서 디버깅이 까다로워질 수 있습니다.

```js
if (officeSupplies.coffee === undefined) {
}
```

#### `in` 연사자를 사용하는 방법

in 연산자는 객체에 키가 존재하는지를 true/false로 반환합니다.

```js
const officeSupplies = {
  pencil: 1000,
  pen: 1500,
  eraser: 500,
  ruler: 1200,
  note: 2000,
  apple: undefined,
};

"pen" in officeSupplies; // true
"apple" in officeSupplies; // true
"banana" in officeSupplies; // false
```

### 객체의 모든 키를 반환

Object.prototype.keys

### 객체의 모든 값을 반환

Object.prototype.values

### 객체의 모든 키와 값을 반환

Object.prototype.entries

### cf. 엔트리로 객체를 구성

Object.fromEntries

#### 객체는 해시테이블용으로 만들어진게 아니다

객체는 해시테이블을 위해서 구현된 것이 아닙니다.
일반적인 객체 리터럴으로 객체를 생성한 경우 생성자인 Object의 prototype 객체를 프로토타입 객체로 하기 때문에, Object.prototype의 메서드에 해당하는 키와 값이 모두 존재합니다.

```js
"hasOwnProperty" in {}; // true

({}["isPrototypeOf"]); // [Function: isPrototypeOf]
```

즉, 제가 추가하지 않은 키와 값이 이미 추가되어 있다는 것입니다.

이를 해결하기 위해서 프로토타입 객체를 null 로 하여서 객체를 생성할 수 있습니다.

```js

const obj = Object.create(null);

"hasOwnProperty" in obj; // false

obj.["isPrototypeOf"]; // undefined

```

하지만 번거롭지 않나요?

해시테이블용으로 만들어진 구현체가 있습니다.

### Map

1. Map은 어떠한 키와 값도 기본적으로 추가되어 있지 않다.

1. 객체는 키값으로 문자열만 올 수 있으나 Map은 모든 타입이 다 올 수 있다. 참조타입이 오는 경우에는 참조값이 같은 경우에 같은 키로 취급한다.

1. 객체는 키의 순서가 보장되지 않으나 Map은 추가한 순으로 키가 나열되는 것이 보장된다.

1. iterable-iterator protocol을 준수하기 때문에 순회가 수월하다.

1. Map은 키의 개수를 O(1)으로 알 수 있으나 객체는 O(N) 이다.

1. Map은 성능면에서도 최적화되어 있다.

#### 사용법

get
set
has
forEach
values
entries

## 4-3. 문제풀이

~~### https://www.acmicpc.net/problem/2480~~

~~카운트~~

### https://www.acmicpc.net/problem/10809

- Map

- has ? get : default vs get() || default

### https://www.acmicpc.net/problem/1157

- Map.prototype.values

### https://www.acmicpc.net/problem/5622

- 객체

## 4-4. Set

고유한 값을 저장하기 위한 자료구조

중복된 값을 허용하지 않는다.

고유한 값 => 해시 테이블의 키 를 떠올리게 된다.

그래서 고유한 값을 만들기 위해서 객체 또는 Map을 활용할 수 있다.

https://www.acmicpc.net/problem/3052

예시로 알아보는...

get
add
has
forEach
values
entries

https://www.acmicpc.net/problem/1316

- 정규표현식, Set size 비교로 배열의 요소가 모두 고유한지 파악

https://www.acmicpc.net/problem/3273

- 집합. 문제를 제대로 읽기
