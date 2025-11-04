+++
date=2024-08-25
title="Integrating VueJS 2 into a Django"
description="Integrating Vue into a Django project doesn’t require heavy tooling. This piece outlines a strategy where the Vue dev server handles local development while Django serves the built files in production, enabling gradual migration from a monolith to a microservice"
[extra]
[extra.cover]
image="two-scoops.avif"
[taxonomies]
tags=["Django","Vuejs","Web","Javascript","Python"]
+++
## Introduction
Going back in time, I was faced with a problem. We had a Django application in production, with some 4,000 deployments around France. We wanted to migrate the views to RESTfull architecture. But such a migration is costly in terms of time and development. Above all, we wanted to migrate from a monolithic application to a microservice with a Vuejs front end. The requirements were highly restrictive: we had to put in place a session authentication system, interoperability with other systems/applications etc...

So reinventing the wheel wasn't the best strategy to adopt. And we had to find a consensus, a common ground to facilitate the migration phase.

I came up with a strategy for a Django-Vue integration that works in both development and production environments. As a bonus, it requires no extra dependencies.

My approach involves three parts:
- Configure Vue to use the Django dev server for local development and the Django production server in production
- Configure Django to serve the production template of a Vue.js application as its homepage
- Configure Django and Vue to serve Vue's static files in production (images, CSS, JS)

Let's get started !

> *Here I'm going to talk about VueJs V2 integration, for VueJs V3 that will come in a future post*

## Project setup
#### Setup Django project
Let's start by setting up a Django project in your favorite location
> *I use MacOs, please refer to your OS documentation for equivalent commands*
```bash
$ mkdir django-vue && cd django-vue
$ python3 -m venv venv
$ . venv/bin/activate
(venv)$ pip install --upgrade pip
(venv)$ pip install django djangorestframework
(venv)$ django-admin startproject django_vue .
```
For now, we have the initial architecture of a Django project:
```bash
├── django_vue
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
└── manage.py

2 directories, 6 files
```
#### Setup vue-cli project for Vue2
###### Install vue-cli:
```bash
$ npm install -g @vue/cli
## OR
$ yarn global add @vue/cli
```
###### Create a Vue2 project:
```bash
## you can name the Vue project whatever you want, here I name it webapp
$ vue create webapp
```
```bash
Vue CLI v5.0.8
? Please pick a preset:
  Default ([Vue 3] babel, eslint)
  Default ([Vue 2] babel, eslint)
❯ Manually select features ## < Chose this one
```
```bash
Vue CLI v5.0.8
? Please pick a preset: Manually select features
? Check the features needed for your project: (Press <space> to select, <a> to
toggle all, <i> to invert selection, and <enter> to proceed)
 ◉ Babel
 ◯ TypeScript
 ◯ Progressive Web App (PWA) Support
 ◉ Router ## include Router
 ◯ Vuex
 ◯ CSS Pre-processors
 ◯ Linter / Formatter
 ◯ Unit Testing
 ◯ E2E Testing
```
```bash
Vue CLI v5.0.8
? Please pick a preset: Manually select features
? Check the features needed for your project: Babel, Router
? Choose a version of Vue.js that you want to start the project with
  3.x
❯ 2.x ## Chose version 2.x
```
```bash
Vue CLI v5.0.8
? Please pick a preset: Manually select features
? Check the features needed for your project: Babel, Router
? Choose a version of Vue.js that you want to start the project with 2.x
? Use history mode for router? (Requires proper server setup for index fallback
in production) (Y/n) n ## No we will talk about router modes later
```
After all these steps VueCLI will generate an application VueJs called webapp in the root directory of ower Django application
```bash
├── django_vue
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── manage.py
└── webapp
    ├── README.md
    ├── babel.config.js
    ├── jsconfig.json
    ├── package.json
    ├── public
    │   ├── favicon.ico
    │   └── index.html
    ├── src
    │   ├── App.vue
    │   ├── assets
    │   │   └── logo.png
    │   ├── components
    │   │   └── HelloWorld.vue
    │   ├── main.js
    │   ├── router
    │   │   └── index.js
    │   └── views
    │       ├── AboutView.vue
    │       └── HomeView.vue
    ├── vue.config.js
    └── yarn.lock

9 directories, 21 files
```
## The Integration strategy
#### Config the vuejs app folder
First things first, We have to include The webapp directory as a Django's application so in `settings.py` we're going to declare two new apps in the `INSTALLED_APPS` list
```python
INSTALLED_APPS = [
    //
    'rest_framework',
    'webapp'
]
```
In the webapp directory we have to add 3 files:
1. `__init__.py` file to mark the webapp directory as a Python package, making it possible to import modules and sub-packages from it.
2. `views.py` file to write the views which will render the Vuejs template
3. `urls.py` file to write the urlpatterns that will match the route patterns
```bash
touch webapp/{__init__.py,views.py,urls.py}
```
#### Configuration of Webpack
In the webapp folder we will change some of webpack settings to customize the build strategy to match Django's app conventions:
###### Staticfiles
If we refer to Django's Documentations we find the following in the StaticFiles section:
> *Store your static files in a folder called static in your app. For example my_app/static/my_app/example.jpg.*

and

> *Static file namespacing Now we might be able to get away with putting our static files directly in my_app/static/ (rather than creating another my_app subdirectory), but it would actually be a bad idea. Django will use the first static file it finds whose name matches, and if you had a static file with the same name in a different application, Django would be unable to distinguish between them. We need to be able to point Django at the right one, and the best way to ensure this is by namespacing them. That is, by putting those static files inside another directory named for the application itself.*

So, We need to build the Vuejs app in a folder called webapp located in the webapp's static folder as following Build to `./static/webapp/`

In the `vue.config.js` file in the `webapp` directory :
```js
const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  outputDir:'./static',
  /*
  this will build the vuejs app to the folder called static
  */
  assetsDir:'webapp', 
  /*
  this folder will contain the build assets (The compiled Javascript, Css etc..)
  */
})
```
Then we can build the Vuejs app `yarn build` or `npm run build` and the directory tree give us this :
```bash
├── django_vue
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── manage.py
└── webapp
    ├── README.md
    ├── __init__.py
    ├── babel.config.js
    ├── jsconfig.json
    ├── package.json
    ├── public
    │   ├── favicon.ico
    │   └── index.html
    ├── src
    │   ├── App.vue
    │   ├── assets
    │   │   └── logo.png
    │   ├── components
    │   │   └── HelloWorld.vue
    │   ├── main.js
    │   ├── router
    │   │   └── index.js
    │   └── views
    │       ├── AboutView.vue
    │       └── HomeView.vue
    ├── static ##NEW
    │   ├── favicon.ico
    │   ├── index.html
    │   └── webapp ## The assets directory
    │       ├── css
    │       │   └── app.ff62af08.css
    │       └── js
    │           ├── about.46c84a43.js
    │           ├── about.46c84a43.js.map
    │           ├── app.412b10e4.js
    │           ├── app.412b10e4.js.map
    │           ├── chunk-vendors.9fa1172e.js
    │           └── chunk-vendors.9fa1172e.js.map
    ├── urls.py
    ├── views.py
    ├── vue.config.js
    └── yarn.lock

13 directories, 34 files
```
###### Templates
By default the Django template loader will look within each app for a templates folder. But to avoid namespace issues you also need to repeat the app name in a folder below that before adding your template file.

So, within the webapp app we create a templates directory, then a webapp directory, and finally our index.html file. The good news is that we can do this automatically during the vujs build phase.

Again in the `vue.config.js` file :
```js
const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  outputDir:'./static',
  /*
  this will build the vuejs app to the folder called static
  */
  assetsDir:'webapp', 
  /*
  this folder will contain the build assets (The compiled Javascript, Css etc..)
  */
 indexPath:'../templates/webapp/index.html'
  /*
  this will copy the index.html file from the static folder to the templates folder
  */
})
```
###### PublicPath and Static settings
Django uses the `STATIC_URL` when referring to static files located in `STATIC_ROOT`.

In Django's Documentation we find:

> *If STATIC_URL is a relative path, then it will be prefixed by the server-provided value of SCRIPT_NAME (or / if not set). This makes it easier to serve a Django application in a subpath without adding an extra configuration to the settings.*

So for prefixing all the assets built with the vue-cli we have to add the `publicPath` key to match the `STATIC_URL` settings value un the `settings.py` file.
```js
const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  outputDir: "./static",
  /*
  this will build the vuejs app to the folder called static
  */
  assetsDir: "webapp",
  /*
  this folder will contain the build assets (The compiled Javascript, Css etc..)
  */
  indexPath: "../templates/webapp/index.html",
  /*
  this will copy the index.html file from the static folder to the templates folder
  */
  publicPath: "static/",
  /*
  this should match the STATIC_URL setting of Django's settings.py file
   */
});
```
###### Vue-router Hash mode
The default mode for vue-router is hash mode - it uses the URL hash to simulate a full URL so that the page won't be reloaded when the URL changes. In other words, Django will provide the navigation to render the Vuejs application, then Vuejs will take over the internal navigation with the hash prefix.

For example `www.mywebsite.com/##/` will load the Vuejs application and to go to `www.mywebsite.com/##/about` the about route is provided by the Vue Router and not by Django url patterns. So, in `webapp/router/index.js` we should change the configurations like this:
```js
import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeView from '../views/HomeView.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/about',
    name: 'about',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "about" */ '../views/AboutView.vue')
  }
]

const router = new VueRouter({
  mode:'hash', // or less it empty by default it is in hash mode
  routes
})

export default router
```
After this we run `yarn build` or `npm run build` in the root folder of the webapp directory
###### Views ans Urls
In the `webapp/views.py`
```python
from django.shortcuts import render

def webapp_index(request):
    return render(request,template_name='webapp/index.html')
```
in the `webapp/urls.py` file:
```python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.webapp_index)
]
```
and then in the main `urls.py` file in the django_vue folder we set the root path to the webappurls:
```python
from django.contrib import admin
from django.urls import path, include ##new

urlpatterns = [
    path('', include('webapp.urls')), ##new
    path('admin/', admin.site.urls)
]
```
## Run the Devlopment server
```bash
(venv)$ python manage.py runserver
```
<div align=center>
<img src="/django_vue.png" width="100%"/>
</div>
Congratulations, the Vuejs app integration works very well with django and now we're going to mock up an API to see how it all works.

## Example app
Start a new django app:
```bash
(venv)$ python manage.py startapp posts
```
Add the posts app to the `INSTALLED_APPS` list in the `settings.py` file, and mock some API to GET a list of whatever you want, so in `posts/views.py`:
```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def get_posts(request):
    data = [
        {'id':1, 'framework':'Djano'},
        {'id':2, 'framework':'Flask'},
        {'id':3, 'framework':'FastAPI'},
        {'id':4, 'framework':'VueJs'},
        {'id':5, 'framework':'React'},
    ]
    return Response(data)
```
And in the `posts/urls.py`:
```python
from django.urls import path
from . import views

urlpatterns = [
    path('posts/', views.get_posts)
]
```
and in the `urls.py` file in the project folder:
```python
from django.contrib import admin
from django.urls import path,include,re_path ##new

urlpatterns = [
    path('',include('webapp.urls')),
    re_path(r"^api/", include('posts.urls')),##new
    path('admin/', admin.site.urls),
]
```
Now Create a `PostsView.vue` file in `webapp/src/views`, the file content :
```html
<template>
    <div>
        <div v-for="post in posts" :key="post.id">
            <span>## {{ post.id }}</span> - <span>{{ post.framework }}</span>
        </div>
    </div>
</template>
<script>
export default {
    name: "PostsView",
    data() {
        return {
            posts: [],
        }
    },
    beforeMount() {
        this.getPosts();
    },
    methods: {
        getPosts() {
            fetch('/api/posts')
                .then((dataJson) => {
                    return dataJson.json()
                })
                .then((data) => {
                    this.posts = data
                })
                .catch((error) => {
                    console.log(error)
                })
        }
    }
}
</script>
```
Then add the posts route to the router file in `webapp/src/router/index.js`:
```js
import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeView from '../views/HomeView.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/about',
    name: 'about',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "about" */ '../views/AboutView.vue')
  },
  {
    path: '/posts',//new
    name: 'posts',//new
    component: () => import(/* webpackChunkName: "posts" */ '../views/PostsView.vue')//new
  }
]

const router = new VueRouter({
  mode:'hash', // or less it empty by default it is in hash mode
  routes
})

export default router
```
In the `App.vue` file add the router link to the posts component:
```html
<template>
  <div id="app">
    <nav>
      <router-link to="/">Home</router-link> |
      <router-link to="/about">About</router-link> |
      <router-link to="/posts">Posts</router-link> //new
    </nav>
    <router-view/>
  </div>
</template>
```
Rebuild the vue app with `yarn build` or `npm run build` and run the django server `python manage.py runserver`
## Results
<div align="center">
<img src="/results_vue_django.gif" width="100%"/>
</div>

## Final words
With a little configuration, Django and Vue can work well together during web application development and when it's ready to go live.
A second benefit of this approach is that when you're developing new features or fixing bugs, you can run the production and development frontends in parallel, with Django's dev server running the production version and Vue's dev server doing the work - I'm working on it

In this post, the Vue.js application and the Django API are treated as separate projects under the same roof, but this doesn't have to be the case.