---
title: 안전한 스크롤 너비 사용
date: "2022-11-17"
---

1. 수직 스크롤이 생기는 요건

- 부모 요소의 높이보다 자식 요소의 높이가 길 때 (paddingBox 기준)
- 부모 요소의 overflow-y 가 auto(또는 scroll)이어야 한다

2. scrollHeight vs offsetHeight vs clientHeight

clientHeight: border 안쪽 기준
offsetHeight: border 바깥쪽 기준
scrollHeight: 자식 요소 포함 가장 긴거 기준

3. scrollTop

요소의 content가 수직으로 스크롤된 정도를 나타낸다.
0: 전혀 스크롤 되지 않음
Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 1: 전부다 스크롤됨

[0, element.scrollHeight - element.clientHeight)

4. 스크롤바의 위치
   element.scrollTop: 머리
   ~
   element.scrollTop + element.clientHeight: 꼬리

길이: element.clientHeight
머리: element.scrollTop
총길이: element.scrollHeight
너비: 외부에서 주입받음

5. 동적 컨텐츠

MutationObserver
