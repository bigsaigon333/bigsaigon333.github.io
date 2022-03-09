import { InferGetStaticPropsType } from "next";

import { getPostData } from "../../lib/posts";

export const getStaticProps = async () => {
  const id = "pre-rendering";
  const postData = await getPostData(id);

  return { props: { postData } };
};

const FirstPost = ({
  postData,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { title, date, contentHtml } = postData;

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <time>{date}</time>
      </header>
      <main dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </div>
  );
};

export default FirstPost;
