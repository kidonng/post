const imageProxy = "$&https://wsrv.nl/?output=webp&url=";

const removeElement = {
  element(element) {
    element.remove();
  },
} satisfies HTMLRewriterElementContentHandlers;

function replaceAttribute(
  name: string,
  search: string | RegExp,
  replace: string,
) {
  return {
    element(element) {
      const attribute = element.getAttribute(name)!;
      element.setAttribute(name, attribute.replace(search, replace));
    },
  } satisfies HTMLRewriterElementContentHandlers;
}

export default {
  async fetch(request, { CHANNEL }) {
    const { url, method } = request;
    const { origin } = new URL(url);

    const proxyRequest = (target = "https://t.me") =>
      fetch(url.replace(origin, target), request);

    const Root = new URLPattern({ pathname: `/{${CHANNEL}}?` });
    const Post = new URLPattern({ pathname: `/${CHANNEL}/*` });
    const List = new URLPattern({ pathname: `/s/${CHANNEL}` });
    const Context = new URLPattern({ pathname: `/s/${CHANNEL}/*` });
    const Video = new URLPattern({
      pathname: "/cdn(\\d).telesco.pe/file/*.mp4",
    });
    const Emoji = new URLPattern({ pathname: "/i/emoji/*" });
    const View = new URLPattern({ pathname: "/v/" });

    const rewriter = new HTMLRewriter()
      .on(
        'link[rel*="icon"]',
        removeElement,
      )
      .on(
        'link[href^="//telegram.org/css/font-roboto.css"]',
        removeElement,
      )
      .on(
        'script[src^="https://oauth.tg.dev/js/telegram-widget.js"]',
        removeElement,
      )
      .on(
        'link[href^="//telegram.org/css/bootstrap.min.css"]',
        replaceAttribute(
          "href",
          /.*/,
          // Telegram uses customized 3.2.0
          "https://cdn.jsdelivr.net/npm/bootstrap@3.2.0/dist/css/bootstrap.min.css",
        ),
      )
      .on(
        'script[src="//telegram.org/js/jquery.min.js"]',
        replaceAttribute(
          "src",
          /.*/,
          "https://cdn.jsdelivr.net/npm/jquery@1.11.1/dist/jquery.min.js",
        ),
      )
      .on(
        'script[src="//telegram.org/js/jquery-ui.min.js"]',
        replaceAttribute(
          "src",
          /.*/,
          // Telegram uses customized 1.11.4 (unavailable via CDN)
          "https://cdn.jsdelivr.net/npm/jquery-ui-dist@1.12.0/jquery-ui.min.js",
        ),
      )
      .on(
        'link[rel="stylesheet"]',
        replaceAttribute("href", "//telegram.org", ""),
      )
      .on(
        'script[src*="telegram.org"]',
        replaceAttribute("src", /(https:)?\/\/telegram\.org/, ""),
      )
      .on(
        // Post image & emoji
        '[style*="background-image"]',
        replaceAttribute("style", "url('", imageProxy),
      )
      .on(
        // Avatar
        "img",
        replaceAttribute("src", "", imageProxy),
      )
      .on(
        "video",
        replaceAttribute("src", "https:/", ""),
      )
      .on(
        `a[href^="https://t.me/${CHANNEL}"]`,
        replaceAttribute("href", "https://t.me", ""),
      );

    if (Root.test(url)) {
      return Response.redirect(`${origin}/s/${CHANNEL}`);
    }

    if (Post.test(url) || Context.test(url)) {
      const response = await proxyRequest();
      return rewriter.transform(response);
    }

    if (List.test(url)) {
      const response = await proxyRequest();

      if (method !== "POST") {
        return rewriter.transform(response);
      }

      const html = await response.json<string>();
      const transformed = await rewriter.transform(new Response(html)).text();
      return Response.json(transformed, response);
    }

    if (Video.test(url)) {
      return proxyRequest("https:/");
    }

    if (Emoji.test(url)) {
      const response = await proxyRequest();
      const data = await response.json<{ emoji: string; thumb: string }>();
      const transformed = {
        ...data,
        emoji: data.emoji.replace("", imageProxy),
        thumb: data.thumb.replace("", imageProxy),
      };
      return Response.json(transformed, response);
    }

    if (View.test(url)) {
      return proxyRequest();
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
