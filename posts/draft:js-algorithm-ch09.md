---
title: Ch09. 정렬
date: "2020-03-16"
summary: 정렬
---

## 9-1. 정렬이란

정렬에서 중요한건 무엇을 어떻게 정렬하느냐

어떻게 정렬하느냐는 내장 메서드로 충분한 것 같다.

~~예외 케이스 두가지: 머지 소트, 카운팅 소트 소개~~

무엇을 정렬하느냐가 알고리즘 문제에 핵심

정렬 후 다른 알고리즘과 결합되는 경우가 많다

그리디 알고리즘과 결합되는 경우가 제일 많은듯

## 9-2. 내장메서드 소개

### Array.prototype.sort()

#### compare 함수의 역할

```js
function compare<T>(a: T, b: T): number;
```

return value < 0 : a b
return value === 0: a,b 원래 순서를 유지해라
return value > 0 : b a

실제 콘솔을 찍어보면 더 헷갈릴 수 있다. 내부 구현에 신경쓰지말고, compare 함수 자체의 의미에 집중해라.

#### compare 함수가 제공되지 않으면 문자열로 변환된 뒤 비교된다

## 9-3. 문제풀이

### 초간단 내장 메서드로 풀어내기

https://www.acmicpc.net/problem/1427

https://www.acmicpc.net/problem/11650
https://www.acmicpc.net/problem/11651

함수형의 장점 보여주기. 딱 한부분만 고치면된다.

https://www.acmicpc.net/problem/18870

### https://www.acmicpc.net/problem/2108

무난. 테크닉. 카운트 세는거 배열으로 더 쉽게 풀수도. 하지만 Map이 정석이다.

### https://www.acmicpc.net/problem/5052

문자열을 사전순으로 정렬할 땐 localeCompare 를 쓸 것

이 문제는 `trie`라는 자료구조로도 구현가능하지만, 정렬으로도 할 수 있다.
