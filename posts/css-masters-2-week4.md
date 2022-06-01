---
title: css-masters-2 4주차 정리
date: "2022-05-29"
---

[css-masters-2](https://github.com/fe-backpackers/css-masters-2) 라는 이름으로 css 스터디를 하고 있습니다.

모던 웹을 위한 HTML5 + CSS3 바이블 3판을 매주 정해진 분량만큼 읽고 의견을 공유하는 방식입니다.

아래는 4주차에 학습한 내용 등을 정리한 것입니다.

---

## CSS Transitions

최초 상태에서 마지막 상태로 전환시 발생하는 애니메이션을 제어하는 방법입니다.
상태란 마우스를 요소 위에 올릴 때, 내릴 때, 누를 떄 등등을 의미하며 주로 [Pseudo-classes](https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes)를 통해 CSS에서는 나타낼 수 있습니다.

모든 속성의 애니메이션을 제어할 수는 없으며, 정해진 속성만을 제어할 수 있습니다.([제어 가능한 CSS 속성](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animated_properties))

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Transitions/Using_CSS_transitions>

## CSS animation 속성

animation 속성의 작성법은 아래와 같습니다.

```css
/* @keyframes duration | easing-function | delay |
iteration-count | direction | fill-mode | play-state | name */
animation: 3s ease-in 1s 2 reverse both paused slidein;

/* @keyframes name | duration | easing-function | delay */
animation: slidein 3s linear 1s;

/* @keyframes name | duration */
animation: slidein 3s;
```

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/animation>

## transform cascading

여러가지 변환 함수를 동시에 적용하고 싶을 때에는 transform 속성에 각각의 함수를 공백으로 구분해 입력하면 됩니다.

```css
#item {
  transform: rotate(60deg) scale(1.2) skewY(10deg);
}
```

아래와 같이 작성해서는 안됩니다. CSS의 cascading 원칙에 따라 가장 마지막에 작성한 transform만 적용됩니다.

```css
#item {
  transform: rotate(60deg); /* 적용되지 않음 */
  transform: scale(1.2); /* 적용되지 않음 */
  transform: skewY(10deg); /* ✅ */
}
```

## 3차원 변환 함수

| 변환 함수                                       | 설명                                    |
| ----------------------------------------------- | --------------------------------------- |
| translate(translateX, translateY)               | 특정 크기만큼 이동합니다                |
| translate3d(translateX, translateY, translateZ) | 특정 크기만큼 이동합니다                |
| scale(scaleX, scaleY)                           | 특정 크기만큼 확대 및 축소합니다        |
| scale3d(scaleX, scaleY, scaleZ)                 | 특정 크기만큼 확대 및 축소합니다        |
| rotateX(angleX)                                 | X축을 기준으로 특정 각도만큼 회전합니다 |
| rotateY(angleY)                                 | Y축을 기준으로 특정 각도만큼 회전합니다 |
| rotateZ(angleZ)                                 | Z축을 기준으로 특정 각도만큼 회전합니다 |
| rotate(angleZ)                                  | Z축을 기준으로 특정 각도만큼 회전합니다 |
| rotate3d(x, y, z, angle)                        | 특정 각도만큼 회전합니다                |

※ X,Y,Z축 모두 다루려면 `~3d` 함수를 사용하여야 합니다.
※ rotate 함수의 경우 angle이 양수이면 시계 방향, 음수이면 반시계 방향으로 회전합니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotate3d>

## @import 규칙

```css
@import url;
```

url은 import 할 자원의 위치를 나타내는 **문자열**이거나, 또는 **url() 함수**입니다. url은 절대경로 또는 상대경로입니다.

### link 요소와의 차이점

> Whereas the link element specifies the name of the style sheet to import using its href attribute, the @import rule specifies the style sheet definition inside a link element or a style element. In the scripting model, this means the owningElement property of the style sheet defined through the @import rule is either a style or a link object. The @import rule should occur at the start of a style sheet, before any declarations. You can place @import rule statements anywhere within the style sheet definition, but the rules contained within the @import rule style sheet are applied to the document before any other rules defined for the containing style sheet. This rule order affects expected rendering. Rules in the style sheet override rules in the imported style sheet.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/@import>
<https://developer.mozilla.org/en-US/docs/Web/CSS/url>
<https://webplatform.github.io/docs/css/atrules/import/>
