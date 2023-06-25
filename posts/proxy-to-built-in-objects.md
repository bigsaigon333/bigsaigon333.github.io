---
title: JS 내장 객체에 Proxy 객체를 적용하는 방법
date: "2023-06-25"
description: Proxy 객체를 이용해서 JS 내장 객체의 행동을 가로채는 방법
keywords: Proxy, Map, built-in object, 내장 객체, internal slot, Reflect, 트랩 설정, 내부 슬롯, set trap
---

## I. 문제상황

Map에 아이템을 추가하는 시점에 추가적인 다른 액션을 하고 싶은 니즈가 있었다.
그래서 Proxy객체를 이용하여 아래와 같이 하면 되지 않을까 생각하여 아래와 같이 선언하였다.

```js
const map = new Map();
const proxifiedMap = new Proxy(map, {
  set: (target, key, value, receiver) => {
    console.log("[proxifiedMap]", { key, value });

    return Reflect.set(target, key, value, receiver);
  },
});
```

그 다음 선언한 `proxifiedMap을` 이용해서 아이템을 추가하면, console.log가 찍히기는 커녕 아래와 같은 타입에러가 발생하였다.

```js
proxifiedMap.set("test-key", 123);

/**
 * Uncaught TypeError: Method Map.prototype.set called on incompatible receiver #<Map>
 *     at Proxy.set (<anonymous>)
 *    at <anonymous>:1:14
 */
```

## II. 발생원인

Map과 같은 빌트인 객체는 아이템을 다루기 위해 internal slot 을 사용한다. internal slot이란, ECMAScript 스펙에서 사용되는 개념으로 빌트인 객체의 목적을 달성하기 위해 내부적인 용도로 사용되는 빌트인 객체의 속성이라고 볼 수 있다. 흔히 스펙에서 `[[internal slot]]`과 같이 대괄호(`[]`) 두 개로 감싸서 표시된다. internal slot은 스펙상으로만 존재하고 외부로 구현이 노출되지 않아, 실제 런타임에서는 어떤 방법으로든 접근할 수 없다.

Map에 아이템을 추가하는 것은 `[[Set]`이 아니라 `[[MapData]]`라는 internal slot을 이용해서 요소들을 저장하고 직접 접근하기 때문에, proxy의 set trap을 이용하여 아이템 추가 시점을 가로챌 수 없다.

```
Uncaught TypeError: Method Map.prototype.set called on incompatible receiver #<Map>
```

위의 에러에서 보는것과 같이 `proxifiedMap.set` 을 호출하면 `Map.prototype.set` 이 호출되며, `Map.prototype.set` 은 `this.[[MapData]]`에 접근하려고 하나, 이 때의 `this` 값은 Map의 인스턴스가 아니라 Proxy의 인스턴스이므로 `[[MapData]]` 이 존재하지 않아 에러가 발생하는 것이다.

## III. 해결방법

Map 도 객체이므로 `set, get, entries`등 프로토타입 메소드에 접근하는 것을 get trap으로 인터셉트 할 수 있다.

```js
const map = new Map();
const proxifiedMap = new Proxy(map, {
  get: (target, key, receiver) => {
    const value = Reflect.get(target, key, receiver);

    console.log("[proxifiedMap]", { key, value });

    return typeof value === "function" ? value.bind(target) : value;
  },
});
```

1. get handler의 key값에 `set, get, entries` 와 같은 프로토타입 메소드명이 할당된다.
2. `Reflect.get` 을 이용하여 `Map.prototype` 의 메소드를 가지고 와 `value`에 할당한다.
3. `value`에 Map 객체 `target`을 바인딩한다. 이로써 실제 `Map.prototype.set` 이 호출될 때 Map 객체가 바인딩되어 있으므로 `this.[[MapData]]`에 접근할 수 있다.

최종적으로 Map에 아이템을 추가하였을 때 추가적인 액션을 하고 싶다면 아래와 같이 작성하면 된다.

```js
const map = new Map();
const proxifiedMap = new Proxy(map, {
  get: (target, key, receiver) => {
    if (key === "set") {
      // 추가적인 액션!!
    }
    const value = Reflect.get(target, key, receiver);

    return typeof value === "function" ? value.bind(target) : value;
  },
});
```

## Reference

- <https://javascript.info/proxy#proxy-limitations>
- <https://tc39.es/ecma262/#sec-map-iterable>
