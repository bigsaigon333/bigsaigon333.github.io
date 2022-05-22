---
title: css-masters-2 3주차 정리
date: "2022-05-22"
---

[css-masters-2](https://github.com/fe-backpackers/css-masters-2) 라는 이름으로 css 스터디를 하고 있습니다.

모던 웹을 위한 HTML5 + CSS3 바이블 3판을 매주 정해진 분량만큼 읽고 의견을 공유하는 방식입니다.

아래는 3주차에 학습한 내용 등을 정리한 것입니다.

---

## 타일 형태의 웹 페이지 레이아웃

핀터레스트에서 볼 수 있는 타일 형태의 레이아웃(cascading grid layout)은 자바스크립트 없이 css로만 구현할 수 없습니다. Masonry 와 같은 라이브러리를 사용하면 쉽게 만들 수 있습니다.

![image](https://user-images.githubusercontent.com/31029000/169675017-bcfb2ea9-3566-4262-9f82-4868e4b9da6c.png)

### Reference

<https://github.com/desandro/masonry>

## viewport meta 태그

- meta태그는 웹 브라우저에 특별한 정보를 제공하는 HTML 태그입니다.
- 모바일 웹 페이지는 화면에 대한 특별한 정보를 제공하기 위해 viewport meta 태그를 사용합니다.

- Long long time ago, 작은 스크린을 가진 모바일 디바이스는 가상의 뷰포트에 페이지를 렌더한 다음에 실제 뷰포트에 맞게 이를 줄여서 사용자에게 보여주었기 때문에, 많은 페이지가 모바일에 최적화되지 않았습니다.
- 작은 스크린을 가진 모바일 디바이스의 가상 뷰포트 문제를 완화하기 위해, 애플은 사파리 iOS에 뷰포트 메타 태그(viewport meta tag)를 도입하여 웹 개발자가 뷰포트의 크기와 규모를 제어할 수 있게 하였습니다.
- 현재 대부분의 많은 모바일 브라우저가 이 태그를 지원하지만 아직 웹 표준의 일부는 아닙니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag>
<https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/UsingtheViewport/UsingtheViewport.html>
<https://developers.google.com/search/docs/advanced/crawling/special-tags>
<https://developer.android.com/guide/webapps/targeting>

## header 요소

- header 요소는 일반적으로 섹션의 제목(h1-h6 요소 또는 hgroup 요소)을 포함하도록 의도되지만, 이는 필수적이지 않습니다. header 요소는 섹션의 목차, 검색 양식 또는 관련 로고를 줄 바꿈하는 데 사용할 수도 있습니다.

- header 요소는 sectioning content가 아니기 때문에 새로운 section을 만들지 않습니다.

- header 요소의 자식으로는 header와 footer를 제외한 Flow content가 올 수 있습니다.

### Reference

<https://html.spec.whatwg.org/#the-header-element>

## h1, h2, h3, h4, h5, h6 요소: 헤딩 요소

- h1는 가장 순위가 높고, h6 은 가장 순위가 낮습니다. 동일한 이름의 두 요소는 같은 순위를 갖습니다.

- 섹션은 어떤 순위의 헤딩 요소를 포함할 수 있습니다. 하지만, 섹션 내에서는 단 하나의 h1 요소만을 사용할 것이 강하게 권장됩니다.
- 아래의 두 html은 시멘틱의 관점에서 동일합니다. 다만 예제2는 구형 접근성 도구 및 구형 브라우저의 스타일링에서 원하는 대로 동작하지 않을 수 있습니다.

```html
<!-- 예제 1 -->
<body>
  <h1>Apples</h1>
  <p>Apples are fruit.</p>
  <section>
    <h2>Taste</h2>
    <p>They taste lovely.</p>
    <section>
      <h3>Sweet</h3>
      <p>Red apples are sweeter than green ones.</p>
    </section>
  </section>
  <section>
    <h2>Color</h2>
    <p>Apples come in various colors.</p>
  </section>
</body>
```

```html
<!-- 예제 2 -->
<body>
  <h1>Apples</h1>
  <p>Apples are fruit.</p>
  <section>
    <h1>Taste</h1>
    <p>They taste lovely.</p>
    <section>
      <h1>Sweet</h1>
      <p>Red apples are sweeter than green ones.</p>
    </section>
  </section>
  <section>
    <h1>Color</h1>
    <p>Apples come in various colors.</p>
  </section>
</body>
```

### Reference

<https://html.spec.whatwg.org/#headings-and-sections>

## vertical-align

- `vertical-align` CSS 속성은 inline, inline-block, table-cell 박스의 세로 정렬을 설정합니다.

- p392 의 img 요소 사이의 공간을 제거하기 위해서 display 속성을 block을 적용하지 않고, `vertical-align: bottom;`과 같이 설정할 수도 있습니다.

### Reference

<https://developer.mozilla.org/en-US/docs/Web/CSS/vertical-align#vertical_alignment_in_a_line_box>

## Visually Hidden

- 렌더 트리에는 요소를 포함시키지만 시각적으로는 감추고 싶을 때가 있습니다.
- 이럴 때 사용하는 기법을 IR 기법이라고 통칭합니다.
- 웹접근성, 성능 측면에서 권장하는 기법이 달라지고 있습니다.
- `text-indent` 속성은 text-indent 스타일 속성이 적용된 요소가 많을 때
  컴퓨터가 웹페이지 로드 시 위치 값을 그만큼 많이 계산해 하므로 성능에 저하를 불러올 수 있습니다.

- 최근에 많이 사용되는 IR기법은 다음과 같습니다.

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

※ **참고**

```css
/* 투명도를 0으로 주는 것과 동일하게 화면에서 사라지지만, 스크린 리더 인식 안함 */
visibility: hidden;

/* 요소가 아예 없는 것으로 인식 */
display: none;

/* 요소의 사이즈를 0으로 만들면 스크린 리더 인식 안함 */
width: 0;
height: 0;
font-size: 0;
line-height: 0;
```

### Reference

- IR기법: <https://m.blog.naver.com/eirene100999/221686480420>
- CSS Triggers: <https://csstriggers.com/>

## 요소에 height: 100% 를 적용하여 화면을 꽉 채우고 싶을 때

```html
<html>
  <style>
    html,
    body {
      height: 100%;
    }

    #content {
      height: 100%;
      background: red;
    }
  </style>
  <body>
    <div id="content">Hello World</div>
  </body>
</html>
```

- 브라우저는 body 요소의 height를 window의 높이와 같게끔 합니다. body 요소의 자식 요소가 window의 높이보다 큰 경우에 문제가 됩니다.
- 데스크톱에서는 문제가 없지만, 일부 모바일 디바이스에서는 스크롤링 이슈를 야기할 수 있습니다.

- 따라서 body 요소에 `min-height` 속성을 추가하는 것이 더 나은 방법입니다.

```css
body {
  min-height: 100vh;
}
```

### Reference

<https://greggod.medium.com/css-do-not-put-height-100-on-the-body-html-e36bda3551b3>
