+++
title="Embedding a Vuetify Frontend into a Go Web Server"
date=2025-10-02
authors = ["Mohamed AL NOSSIRAT"]
description=""
[taxonomies]
tags=["Vuejs","Vuetify","Javascript", "Go",]
[extra]
cover="goembed.png"
cover_source="Unsplash"
+++
## Introduction
Vuetify is a Material‑Design component library for Vue. The official site describes it as a "no‑design‑skills required Open Source UI library with beautifully handcrafted Vue components". It comes with more than seventy components, automatic tree shaking, RTL support, form validation and even internationalisation for 45 languages. Because it follows Google’s Material guidelines and supports server‑side rendering (SSR) and Nuxt a Vuetify SPA makes an excellent companion for a Go back‑end.

Modern Go can embed static files directly into the binary using the embed package introduced in Go 1.16. This allows us to compile a single executable that serves both the API and the front‑end. This article shows how to create a Vuetify frontend (using Vite or the CLI) and then explores three ways to host the resulting dist directory with Go:

1. Using the Go standard library (net/http)

2. Using Gin, a popular HTTP framework with an opinionated API

3. Using Fiber, a high‑performance framework inspired by Express.js

Along the way we will discuss the pros and cons of each method and when you might prefer one over another. The style used here takes inspiration from my existing posts: conversational, example‑driven and focused on practical code.

## Building the Vuetify frontend
First create the Vue/Vuetify project. Vuetify provides a CLI (npm create vuetify) or you can add it to an existing Vue project via Vite. For example:

```bash
# create a new Vue 3 project and move into it
pnpm create vue@latest
cd my-vuetify-app

# install Vuetify and its peer dependencies
pnpm add vuetify @vuetify/plugin-vuetify

# enable Vuetify in vite.config.js
// vite.config.js
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({
      components,
      directives,
    }),
  ],
})

```
Vuetify’s default preset already includes the Roboto font and Material Design icons. If you opt to embed everything via CDN, remember to include the required fonts and CSS in the <head> and load the Vue and Vuetify scripts at the bottom of the page.
Once you’re happy with the UI, build the project:
```bash
pnpm run build # produces a dist directory with index.html and assets

```
The resulting dist/ directory is what we will embed into our Go application.

## Approach 1 – Serving the SPA with the Go standard library
Go’s net/http package is minimal and gives you full control of the HTTP server. By combining it with the embed package, you can build a single binary that contains the front‑end assets. Below is a simplified example:
```go
package main

import (
    "embed"
    "io/fs"
    "log"
    "net/http"
)

//go:embed dist
var embeddedFiles embed.FS

func main() {
    // strip the leading dist/ from the embedded filesystem
    stripped, err := fs.Sub(embeddedFiles, "dist")
    if err != nil {
        log.Fatal(err)
    }

    // create a file server using http.FS
    spa := http.FileServer(http.FS(stripped))

    // handle API routes first
    http.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(`{"message": "Hello from Go!"}`))
    })

    // fallback to the SPA for all other routes
    http.Handle("/", spa)

    log.Println("Server listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}

```
The call to `fs.Sub` strips the dist prefix and `http.FileServer` serves files from the embedded filesystem. Because we mount the file server at `/`, any path that is not handled by the API will fall back to the SPA’s `index.html`. This approach yields a tiny binary with zero external dependencies and maximal control. In fact, the `net/http` package is extremely fast due to minimal overhead and gives you direct access to `request/response` handling.
### Pros
* **Maximal control and no dependencies – you explicitly define routing and middleware.**
* **Minimal overhead and high performance.**
* **Good learning exercise – you will gain deeper knowledge of Go’s networking primitives.**
### Cons
* **Routing and middleware quickly become verbose for large applications.**
* **You must implement features like JSON binding, validation and error handling yourself.**

> This method suits small services where you need complete control and do not want any framework overhead.

## Approach 2 – Serving the SPA with Gin
[Gin](https://gin-gonic.com/) is a popular HTTP framework built around a high‑performance router. It provides concise APIs for routing, middleware, JSON binding and error handling. To embed a front‑end in Gin you still use go:embed, but Gin offers helper functions such as StaticFS and FileFromFS to serve files from an embedded filesystem.
```go
package main

import (
    "embed"
    "io/fs"
    "net/http"

    "github.com/gin-gonic/gin"
)

//go:embed dist
var embeddedFiles embed.FS

func main() {
    // create a Gin router with default middleware (logger & recovery)
    router := gin.Default()

    // set up API routes
    router.GET("/api/hello", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"message": "Hello from Gin"})
    })

    // mount the embedded SPA
    stripped, err := fs.Sub(embeddedFiles, "dist")
    if err != nil {
        panic(err)
    }
    // serve static files with a custom handler
    fileServer := http.FileServer(http.FS(stripped))
    router.NoRoute(func(c *gin.Context) {
        // serve index.html for any route not matched by API routes
        fileServer.ServeHTTP(c.Writer, c.Request)
    })

    router.Run(":8080")
}

```
In this setup, API routes are defined first. `NoRoute` acts as a catch‑all: if a request does not match an API route it calls the file server, which serves `index.html` or other static assets. You could also mount the SPA under a prefix using `router.StaticFS("/", http.FS(stripped))` and avoid route conflicts.

### Pros of using Gin

* **Rapid development – built‑in routing, middleware and JSON binding accelerate development.**
* **Readable code – concise API for common web patterns**
* **Performance and community – Gin’s trie‑based router is extremely fast and the framework has a large ecosystem**
* **Error handling & recovery – `gin.Default()` includes logging and panic recovery.**
### Cons
* **Adds an external dependency and introduces Gin‑specific abstractions.**
* **The framework’s conventions can hide some of the underlying HTTP details, which some developers may find too “magical”.**

> Use Gin when you need robust routing, middleware and request binding out‑of‑the‑box and are willing to trade a small amount of control for productivity


## Performance considerations

All approaches can handle a Vuetify SPA without noticeable latency. Go’s standard library is extremely fast because there is virtually no framework overhead. Gin introduces a small overhead but still ranks among the fastest frameworks. However, real‑world performance differences are often negligible compared to other factors like database calls, API logic and network latency.
## Choosing the right approach
1. **Small microservice or learning exercise** – use net/http. You’ll write more boilerplate but gain mastery over Go’s HTTP primitives. Embedding the SPA is trivial and there are no dependencies.
2. **General web API or REST service** – use Gin. It provides robust routing, middleware, validation and has a large ecosystem. Embedding the SPA requires only a few extra lines and you get better error handling.

## Conclusion
By combining Vuetify’s polished Material‑Design components with Go’s powerful HTTP stack, you can deliver fast, responsive single‑page applications from a single binary. Start by building your Vuetify front‑end, then choose the Go serving approach that best fits your project:

- **The standard library provides raw speed and maximum control but demands more boilerplate.**

- **Gin gives you features and conciseness at the cost of extra dependencies.**

Whichever path you choose, the embed package makes it trivial to package your Vue/Vuetify build inside the Go binary, enabling self‑contained deployments and a seamless developer experience.