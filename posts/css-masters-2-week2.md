---
title: css-masters-2 2주차 정리
date: "2022-05-15"
---

[css-masters-2](https://github.com/fe-backpackers/css-masters-2) 라는 이름으로 css 스터디를 하고 있습니다.

모던 웹을 위한 HTML5 + CSS3 바이블 3판을 매주 정해진 분량만큼 읽고 의견을 공유하는 방식입니다.

아래는 2주차에 학습한 내용 등을 정리한 것입니다.

---

## pseudo-element selector

CSS2 에서는 `:` 가 표준이었는데 CSS3부터 `::` 가 표준으로 변경되었습니다.

![](https://user-images.githubusercontent.com/31029000/167833289-c20314dc-7e12-4682-9ddd-5d27dc2c6dde.png)

웹 기술에서는 일반적으로 [하위 호환성](https://www.w3.org/People/Bos/DesignGuide/compatibility.html)을 중요시 여기기 때문에, 표준은 바뀌더라도 기존 문법은 그대로 지원한다고 이해하면 좋습니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/::before>

## RGB 색상의 코드가 0~255 사이의 정수가 아닐 경우

rgb색상은 `color: rgb(255,255,255)` 와 같이 사용합니다.
rgb 색상 단위에서 각각의 숫자는 0부터 255 사이의 숫자 또는 퍼센테이지로 구성되어야 합니다.

만약 각각의 숫자가 255를 초과하는 정수인 경우, 그 숫자는 255로 간주되며, 0미만의 정수인 경우 0으로 간주됩니다.

만약 소수점이 있는 수인 경우, 반올림한 정수로 간주됩니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/rgb#values>

<https://developer.mozilla.org/en-US/docs/Web/CSS/number>

## margin: [margin-top] [margin-right] [margin-bottom] [margin-left]

`margin` 속성은 `[margin-top] [margin-right] [margin-bottom] [margin-left]` 속성의 축약형입니다.

```css
div {
  margin: 10px 10px 10px 10px;
  margin-bottom: 0;
}

/* 아래와 동일
div {
  margin: 10px 10px 0 10px;
}
*/
```

축약형을 사용하게 되면 의도치 않게 기존의 margin 값을 덮어버리게 되는 경우가 존재합니다.

```css
div {
  margin-bottom: 10px;
}

.A {
  margin: 20px 10px;
}
```

```html
<!--  div.A 의 margin-bottom은 10px이 아닌 20px입니다 -->
<div class="A"></div>
```

축약형 사용시에는 기존의 스타일을 해치지 않도록 신중해야 합니다.

## box-shadow 속성

```css
/* offset-x | offset-y | blur-radius | spread-radius | color */
/* 오른쪽 | 아래 | 흐림도 | 퍼짐도 | 색상 */
box-shadow: 2px 2px 2px 1px rgba(0, 0, 0, 0.2);
```

**spread-radius**: 양의 값이면 shadow가 팽창하여 더 커지고, 음의 값이면 축소한다.

box-shadow: 10px 5px 5px red;
<img width="335" alt="image" src="https://user-images.githubusercontent.com/31029000/168477185-b03d0855-ff81-4349-8346-a1e36c093734.png">

box-shadow: 10px 5px 5px 10px red;
<img width="370" alt="image" src="https://user-images.githubusercontent.com/31029000/168477198-a58c50d9-b7cb-4511-9db1-ec3d215a6e8f.png">

box-shadow: 10px 5px 5px 20px red;
<img width="353" alt="image" src="https://user-images.githubusercontent.com/31029000/168477214-c48a3a01-d268-40a9-9a89-80cc14a4123c.png">

box-shadow: 10px 5px 5px -5px red;

<img width="334" alt="image" src="https://user-images.githubusercontent.com/31029000/168477282-f12c744d-d233-4632-b9cb-3aca1d455724.png">

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow>

## CSS3 단위: em, rem

- em은 `font-size`와 같은 타이포그래피 관련 속성에서는 부모 요소를 기준으로 몇 배인지를 나타내는 단위입니다. 그외의 속성에서는 요소 자기 자신의 글꼴 크기(`font-size`)의 몇 배인지를 나타내는 단위입니다.

- rem은 문서의 최상위 요소인 html 요소의 글꼴 크기(`font-size`)를 기준으로 몇 배인지 크기를 정합니다.
  일반적으로 html 요소의 글꼴 크기는 16px 입니다. 따라서 `div { width: 2rem; }` 인 경우, div의 width 는 `16px x 2 = 32px`이 됩니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Values_and_units>

## inline vs inline-block

![image](https://user-images.githubusercontent.com/31029000/169675449-547eb42b-59be-4c6e-a026-ddf60021a76c.png)

### display: inline

- width, height 속성이 적용되지 않습니다.
- margin 속성은 좌우로만 지정됩니다.
- 너비가 존재하지 않으므로 중앙이라는 개념이 없어 text-align 속성을 사용할 수 없습니다.

### display: inline-block

- width, height 속성을 적용할 수 있습니다.
- margin 속성을 상하좌우로 적용할 수 있습니다.

### Reference

<https://www.samanthaming.com/pictorials/css-inline-vs-inlineblock-vs-block/>

## background-size: contain vs cover

### contain

- aspect-ratio를 유지한 채 요소의 컨텐트 박스를 벗어나지 않을 만큼만 커진다

<img width="510" alt="image" src="https://user-images.githubusercontent.com/31029000/168478464-a97e3432-a879-44b0-89ff-91119e55d2d2.png">

### cover

- aspect-ratio를 유지한 채 요소의 컨텐트 박스 전체를 채울때까지 커진다

<img width="511" alt="image" src="https://user-images.githubusercontent.com/31029000/168478485-73a77ec8-d3cb-4a70-aa3e-84b8f1c69dd9.png">

object-fit 속성의 contain, cover 값도 동일하다

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit>
