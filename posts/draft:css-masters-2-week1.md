---
title: css-masters-2-week1
date: "2022-05-08"
summary: css-masters-2-week1
---

## 웹 표준은 W3C에서 만듭니다

웹 표준은 W3C에서 만든다. 여기서 웹은 HTML, CSS, JS, 웹 브라우져, WebAssembly, 접근성 등 웹과 관련된 모든 것을 의미합니다.
다만, HTML 표준은 WHATWG 에서, JS 표준은 ECMA 에서, 3D Graphics의 표준은 Khronos 에서 작성합니다.

<https://www.w3.org/TR/> 에서 표준을 검색할 수 있습니다.

W3C는 일정 프로세스에 따라서 웹 기술에 대한 기술을 문서화하고 이를 Recommendations 로 발행하는데, 이것이 웹 표준으로 간주됩니다.

<https://www.w3.org/standards/faq.html#std>

### 참고

<https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/The_web_and_web_standards#web_standards>

## 단독으로 사용되는 태그: void 요소

[HTML 표준](https://html.spec.whatwg.org/#elements-2)에 따르면, HTML 요소(element)는 여섯 개의 카테고리로 구별이 되는데, 그중 br, hr, img, input 등 시작 태그만 존재하는 요소를 void 요소 로 분류합니다.

따라서 이들 void 요소는 `<br>`, `<hr>`, `<img>` 와 같이 시작 태그만을 작성하는 것이 웹표준입니다.

다만, XHTML5에서는 `<br />`, `<hr />`, `<img />` 와 같이 표기하는데, void 요소를 시작 태그만 있고 끝 태그가 없는 것으로 오인하지 않게 하기 때문에 가독성이 더 좋아 많은 개발자들이 void 요소를 XHTML5 표기법으로 기재합니다. 이러한 표기법을 웹표준에서는 self-closing tag라고 칭하며, 이는 Foreign 요소에서 허용되는 표기법입니다.

[W3C Markup Validation Service](https://validator.w3.org/)에서 void 요소를 XHTML5 표기법(self-closing tag)으로 작성하여도 유효한 것으로 판정합니다.

또한 JSX 에서는 void 요소 뿐만이 아니라 자식 요소가 없는 요소들은 모두 XHTML5 표기법(self-closing tag)으로 나타낼 수 있습니다.
(예시: `<Component {...props} />`)

## 요소(element) vs 태그(tag)

```html
<div>Hello World</div>
```

위와 같은 div 요소가 있습니다. `<div>` 는 div 요소의 시작 태그입니다. `</div>`는 div 요소의 끝 태그입니다. 즉, `<div>Hello World</div>`는 `Hello World`라는 TextContent를 가졌으며 시작 태그를 `<div>`로 하고 끝 태그를 `</div>`로 하는 div HTML요소입니다. 요소가 실체라면 태그는 표현입니다.
즉, 태그는 HTML 요소를 문자열으로 나타낸 것이라고 봐도 좋습니다. html 마크업을 할 때에는 요소와 태그를 혼용해서 사용해도 헷갈리지 않으나, js 에서 동적으로 생성하는 요소들(예시: `const div = document.createElement("div")`)은 태그라는 표현이 맞지 않습니다. js에서는 이러한 요소를 DOM 트리에 추가하여 DOM에 반영하지만, 실제로 HTML 파일에 문자열을 추가하는 건 아니기 때문입니다.

### 참고

<https://html.spec.whatwg.org/#start-tags>

## a 요소에 href 속성은 반드시 있어야 하는가?

href 속성은 하이퍼링크의 주소를 나타냅니다.

a 요소가 href 속성을 가지고 있으면 a 요소의 컨텐츠로 라벨링된 하이퍼링크를 의미합니다.

a 요소에 href 속성이 없다면, a 요소는 a 요소의 컨텐츠와 관련된 링크애 대한 **플레이스홀더**를 나타냅니다.

예를 들어 현재 /examples 라우트에 있다면 nav에서 /examples로 가는 a 요소의 href 속성을 비워둘 수 있습니다.

```html
<nav>
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/news">News</a></li>
    <li><a>Examples</a></li>
    <li><a href="/legal">Legal</a></li>
  </ul>
</nav>
```

※ href 속성이 있을 때만 a 요소는 interactive content 카테고리에 속하게 됩니다.

<https://html.spec.whatwg.org/#the-a-element>

## img 요소의 width, height 속성 vs css width, height 속성

```html
<style>
  img {
    max-width: 100%;
    height: auto;
  }
</style>
<h1>Your title</h1>
<p>Introductory paragraph.</p>
<div id="parent">
  <img src="hero_image.jpg" alt="" height="500" width="500" />
</div>
<p>Lorem ipsum dolor sit amet, consectetur…</p>
```

`height="500" width="500"` 가 `max-width: 100%; height: auto;` 보다 우선순위가 낮다. 따라서 최초 img 로드시에는 height를 알 수 없기 때문에 `height: auto` 가 의도했던 대로 동작하지 않아 레이아웃 시프트가 발생하게 된다.

이러한 문제를 해결하기 위해 `padding-bottom` trick이 주로 사용되었으며 최근에는 CSS에 추가된 `aspect-ratio` 속성을 이용하여 해결할 수도 있다.

자세한 내용은 [블로그](https://www.smashingmagazine.com/2020/03/setting-height-width-images-important-again/)를 참고하시기 바랍니다.

## source 요소의 type 속성

source 요소의 부모 요소가 picture 요소인 경우, type 속성이 지정되어야 합니다.

type 속성이 지정된 경우, 웹 브라우저는 type 속성을 보고 지원하지 않는 타입이라면 해당 이미지를 fetching하는 것을 스킵합니다.
type 속성이 지정되지 않은 경우, 웹 브라우저는 이미지를 fetching한 후에야 해당 이미지 형식을 지원하는지 아닌지 알 수 있습니다. 또한 fetching 한 이미지 형식을 지원하지 않더라도 다른 source 요소를 선택하지 않습니다.
따라서 다양한 이미지 형식 중 웹 브라우저가 지원하는 이미지 형식을 보여주고자 할 때에는 source 요소에 반드시 type 특성을 지정해주어야 합니다.

```html
<picture>
  <source srcset="/media/cc0-images/surfer-240-200.webp" type="image/webp" />
  <source srcset="/media/cc0-images/surfer-240-200.png" type="image/png" />
  <source srcset="/media/cc0-images/surfer-240-200.jpg" type="image/jpeg" />
  <img src="/media/cc0-images/surfer-240-200.jpg" alt="surfer" />
</picture>
```

### 참고

<https://html.spec.whatwg.org/#the-source-element>

<https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types>

## 전체 선택자(Universal selector): `*`

전체 선택자를 사용하면 html 요소를 포함해 head 요소, title 요소, style 요소 등 문서 내 모든 단일 요소가 선택됩니다. (가상 요소는 선택되지 않습니다)

<img width="600" alt="전체 선택자" src="https://user-images.githubusercontent.com/31029000/167280380-73136603-b5c8-43ef-abee-4959123e903d.png" >

### 참고

<https://drafts.csswg.org/selectors-3/#universal-selector>

## 기본 속성과 속성 선택자

CSS는 HTML 요소의 기본 속성이 무엇인지 관심을 갖지 않습니다.

input 요소에 type을 명시하지 않으면 기본값으로 text가 할당되지만, CSS는 이를 신경쓰지 않기 때문에 명시적으로 type="text" 를 지정하지 않은 input 요소에는 스타일이 적용되지 않습니다.

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      input[type="text"] {
        background: blue;
      }
    </style>
  </head>
  <body>
    <form>
      <!-- 배경색 없음 -->
      <input />
      <!-- 배경색 파랑 -->
      <input type="text" />
    </form>
  </body>
</html>
```
