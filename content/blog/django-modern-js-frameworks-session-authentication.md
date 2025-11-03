+++
authors=["Mohamed AL NOSSIRAT"]
date=2024-10-11
title="Django & Modern JS Frameworks Session Authentication"
description="Django is one of the most popular backend web application frameworks that exists and it's written in Python. Vue.js is one of the most popular JavaScript tools for adding dynamic features to a web application.Django doesn't need Vue to run. Vue doesn't need Django to run. The combination gives developers an incredibly flexible and dynamic paradigm while also leveraging a number of the built-in benefits that each tool has."
[extra]
[extra.cover]
image="django-session.webp"
cover_source="Unsplash"
[taxonomies]
tags=["Django","Web","Javascript","Python"]
+++
## Introduction
When building a single-page application (SPA) with Django & Django Rest Framework (DRF) alongside frameworks like React, Vue, or Angular, a common question developers face is: " *How should I handle authentication ?* "

Several options are available:

- JSON Web Tokens (JWT)
- Django REST Framework's TokenAuthentication

This can be confusing, even for experienced developers.

However, I'd like to suggest a simpler alternative: just use Django’s built-in authentication system.

> **Disclaimer: I am not a security expert, and this article does not provide any security advice. For guidance tailored to your specific needs, please reach out to a qualified security professional.**

## JSON Web Tokens (JWT)

[JWT (JSON Web Token)](https://auth0.com/learn/json-web-tokens/) is a widely-used method for API authentication. If you're building a modern web application with Vue.js or React on the frontend and Django Rest Framework (DRF) on the backend, it's likely you'll consider JWT as a top option for implementing authentication.

However, JWT is just one approach, and it's neither the simplest nor the most reliable. It isn’t supported natively by Django Rest Framework, which means you'll need extra libraries and configuration to set it up in your project.

Additionally, implementing JWT securely can be quite challenging due to its complex design. As [James Bennet](https://groups.google.com/g/django-developers/c/6oS9R2GwO4k/m/Rep92xfsAwAJ), a long-time Django project contributor, puts it:
> *"JWT is over-complex, puts too much power in the attacker's hands, has too many configuration knobs, and makes poor cryptographic choices. This is why we see vulnerabilities in JWT libraries and JWT-using systems again and again and again."*

Here is some examples of [JWT vulnerabilities](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/) found in the wild.

So on every request, we send the JWT via an HTTP header:

```txt
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dfJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTC2JjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```
We may not understand every technical aspect of JWTs, but the general idea is simple: a server issues a token, we include it in each request, and it grants us access to protected resources like `/api/something`.

However, storing this token for repeated use poses a challenge. While native mobile apps offer secure storage options, web browsers rely on `localStorage` or `sessionStorage` both of which are insecure.

These storage options are vulnerable to cross-site scripting (XSS) attacks. The only safe option in browsers is using cookies, although non-HTTP cookies (like those accessible via document.cookie) remain insecure since scripts can still read them. Storing JWTs in cookies might help, but it doesn't address deeper issues with JWTs.

The most significant concern is that once a JWT is intercepted, it is [vulnerable to brute-force attacks](https://owasp.org/www-chapter-vancouver/assets/presentations/2020-01_Attacking_and_Securing_JWT.pdf). For this reason, JWTs are best used as a short-term solution to acquire something more secure, such as a session ID or OAuth access token, which should be stored in cookies.

Another major drawback of JWTs is that they cannot be easily invalidated. This creates challenges in handling situations like:

* Logging out
* Compromised accounts
* Password changes
* Permission updates
* User de-provisioning

If you choose to use JWTs, ensure they are short-lived and promptly exchanged for a more secure method of authentication.

## Django REST Framework's TokenAuthentication
[Django REST Framework](https://www.django-rest-framework.org/) includes a built-in [TokenAuthentication](https://www.django-rest-framework.org/api-guide/authentication/#tokenauthentication) mechanism that generates unique tokens for each user and issues them through the built-in view `rest_framework.authtoken.views.obtain_auth_token`.

When authentication is successful, this view returns a JSON response with the token, which can be sent in an HTTP header like this:

```txt
Authorization:token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b
```
While this method works, we face the same challenge in a browser environment: where do we securely store this token ?

If only Django provided a secure token stored in cookies for use in every request ?

***The good news is that if you can control the domain of both your backend and your frontend, you can use a much simpler method: Django sessions.***

## Poject Setup
Create a new Django project
### Backend
```bash
mkdir -p ~/django-session-app
cd ~/django-session-app
mkdir server
cd server
python3 -m venv venv
source venv/bin/activate
(venv) pip install django djangorestframework django-cors-headers
(venv) django-admin startproject config .
(venv) python manage.py createsuperuser # create your superuser for me --username:admin --password:admin
(venv) touch Dockerfile
```
Folder structure
```bash
server/
├── config
│   ├── asgi.py
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── Dockerfile
├── manage.py
└── requirements.txt

2 directories, 12 files

```
#### Dockerfile
```dockerfile
# pull official base image
FROM python:3.12-slim-bullseye

# set work directory
WORKDIR /app

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# install dependencies
RUN pip install --upgrade pip
COPY ./requirements.txt .
RUN pip install -r requirements.txt

# copy project
COPY . .
```
server's `requirements.txt`
```bash
asgiref==3.8.1
Django==5.1.1
django-cors-headers==4.4.0
djangorestframework==3.15.2
sqlparse==0.5.1
```
### Frontend
For this example I will use Vuejs with Vuetify to get some styled components, you can do the same thing with React, Angular, Svelte etc...
```bash
npm create vuetify@latest
```
follow the instructions to scaffold a new vuetify project

Folder structure
```bash
frontend/
├── index.html
├── jsconfig.json
├── package.json
├── pnpm-lock.yaml
├── public
│   └── favicon.ico
├── README.md
├── src
│   ├── App.vue
│   ├── assets
│   │   ├── logo.png
│   │   └── logo.svg
│   ├── components
│   │   ├── AppFooter.vue
│   │   ├── HelloWorld.vue
│   │   └── README.md
│   ├── main.js
│   └── plugins
│       ├── index.js
│       ├── README.md
│       └── vuetify.js
└── vite.config.mjs

5 directories, 17 files
```
## Login View
```html
<template>
  <v-app>
    <v-main>
      <v-container class="fill-height">
        <v-row justify="center">
          <v-col cols="12" md="3">
            <v-card>
              <v-card-text>
                <v-form @submit.prevent="login">
                  <v-text-field v-model="credentials.username" variant="outlined" label="Username"></v-text-field>
                  <v-text-field v-model="credentials.password" variant="outlined" label="Password"></v-text-field>
                  <v-btn type="submit" block color="primary">Login</v-btn>
                </v-form>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { reactive } from 'vue';

const credentials = reactive({ username: "", password: "" })
const login = () => {
  fetch("/api/login/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials)
    }
  )
  .then(response=>response.json())
  .then(data=>console.log(data))
}
</script>
```
#### Dockerfile
```dockerfile
FROM node:lts-alpine

# install simple http server for serving static content
RUN npm install -g pnpm

# make the 'app' folder the current working directory
WORKDIR /app

# copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# install project dependencies
RUN pnpm install

# copy project files and folders to the current working directory (i.e. 'app' folder)
COPY . .
```
## Nginx
I will use Nginx to reverse-proxy the server and the frontend, so the domain of the setup is the same for both.
#### Dockerfile
```dockerfile
FROM nginx:1.25

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d
```
#### Nginx config file
```bash
upstream server {
    server server:8000;
}

upstream client {
    server frontend:3000;
}


server {

    listen 80;
    server_name django-session-app.localhost;

    location / {
        proxy_pass http://client;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_redirect off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }

    location /api/ {
        proxy_pass http://server;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_redirect off;
    }
    location /static/ {
        proxy_pass http://server;
    }

}
```
## Docker Compose File
```yml
services:
  server:
    container_name: server
    build: ./server
    command: python manage.py runserver 0.0.0.0:8000
    expose:
      - 8000
    volumes:
      - ./server:/app/
  frontend:
    container_name: frontend
    build: ./frontend
    command: pnpm dev --host
    expose:
      - 3000
    volumes:
      - ./frontend:/app/
      - /app/node_modules
  nginx:
    container_name: reverse_proxy
    build: ./nginx
    ports:
      - 80:80
```
## Build and run the docker compose
```bash
docker compose build && docker compose up -d
```
gand then go to [http://django-session-app.localhost](http://django-session-app.localhost)

## Django Rest Framework settings
Django Rest Framework comes with built-in session based authentication. To use it you have to add this in your Django settings module:
```python
INSTALLED_APPS = [
    ...
    "rest_framework"
]
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}
```
Remember that authentication deals with recognizing the users that are connecting to your API, while permissions deals with giving access to some resources to the users.

In the `DEFAULT_AUTHENTICATION_CLASSES` list you are configuring only the good old Django sessions to authenticate users. In the `DEFAULT_PERMISSION_CLASSES` list you are requiring that only authenticated users will access your endpoints.

Django sessions are based by default on a session cookie stored on the client. There's no need for a "Token", an "Authorization" header or something like that.
If you can store that session cookie on the client and send it on every request to your API you will authenticate the user.
## Django Rest Framework authentication endpoint
Now it's time to write a very simple view to let the users authenticate with a username/password.

We'll need a serializer that will take the username and password from the request and will perform the actual authentication using Django authenication framework.

Create a serializers.py file in your app and add this code to it:
```python
from django.contrib.auth import authenticate

from rest_framework import serializers

class LoginSerializer(serializers.Serializer):
    """
    This serializer defines two fields for authentication:
      * username
      * password.
    It will try to authenticate the user with when validated.
    """
    username = serializers.CharField(
        label="Username",
        write_only=True
    )
    password = serializers.CharField(
        label="Password",
        # This will be used when the DRF browsable API is enabled
        style={'input_type': 'password'},
        trim_whitespace=False,
        write_only=True
    )

    def validate(self, attrs):
        # Take username and password from request
        username = attrs.get('username')
        password = attrs.get('password')

        if username and password:
            # Try to authenticate the user using Django auth framework.
            user = authenticate(request=self.context.get('request'),
                                username=username, password=password)
            if not user:
                # If we don't have a regular user, raise a ValidationError
                msg = 'Access denied: wrong username or password.'
                raise serializers.ValidationError(msg, code='authorization')
        else:
            msg = 'Both "username" and "password" are required.'
            raise serializers.ValidationError(msg, code='authorization')
        # We have a valid user, put it in the serializer's validated_data.
        # It will be used in the view.
        attrs['user'] = user
        return attrs
```
Then we can use this serializer in a login view. Add this to your views.py file:
```python
from rest_framework import permissions
from rest_framework import views
from rest_framework.response import Response

from . import serializers

class LoginView(views.APIView):
    # This view should be accessible also for unauthenticated users.
    permission_classes = (permissions.AllowAny,)

    def post(self, request, format=None):
        serializer = serializers.LoginSerializer(data=self.request.data,
            context={ 'request': self.request })
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        login(request, user)
        return Response(None, status=status.HTTP_202_ACCEPTED)
```
Mount your view in the project urls.py:
```python
from django.contrib import admin
from django.urls import path
from . import views
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/login/', views.LoginView.as_view()),
]
```
## The Session and Django settings
When it comes to security, tried-and-true technologies are often the best choice because they’ve had plenty of time to expose and fix vulnerabilities. If we set a few more settings in Django, we'll enable additional security:
```python
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = True
```
For further readings about Django's session framework [see here](https://docs.djangoproject.com/en/5.1/ref/settings/#sessions)

Now go to the login page in the front and enter the user name and the password and click on Login. If every thing went good you will see the `sessionid` and the `csrftoken` in the browser's `Devtools` -> `Application` -> `Cookies`:
<div style="overflow-x: auto; max-width: 100%;">
  
|Name|Value|Domain|Path|Expire/Max-Age|Size|HttpOnly|Secure|Samesite|Patrition key Site|Cross Site|Priority|
|-|-|-|-|-|-|-|-|-|-|-|-|
|sessionid|p21pms0oohese5l5f77lx7vzhyi7vquk|django-session-app.localhost|/|2024-10-25T11:29:06.595Z|41|✓|✓|Lax|||Medium|
|csrftoken|TMOR7cOrEqLrGd3C3FjxX684yyjacu3v|django-session-app.localhost|/|2024-10-25T11:29:06.595Z|41|||Lax|||Medium|

</div>
The user is correctly logged in and a session cookie named sessionid has been returned to our client. If we will persist that session cookie in each request, our user will be persistently authenticated.
## Django Rest Framework Logout endpoint
Next, we'll wire up a few views that let us logout :
```python
from rest_framework import permissions
from rest_framework import views
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import login,logout #new
from . import serializers

class LoginView(views.APIView):
    # This view should be accessible also for unauthenticated users.
    permission_classes = (permissions.AllowAny,)

    def post(self, request, format=None):
        serializer = serializers.LoginSerializer(data=self.request.data,
            context={ 'request': self.request })
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        login(request, user)
        return Response(None, status=status.HTTP_202_ACCEPTED)

class LogoutView(views.APIView): # new
    # This view should be accessible only for authenticated users.
    def post(self, request, format=None):
        logout(request)
        return Response(None, status=status.HTTP_202_ACCEPTED)
```
Update the urls.py file like this:
```python
from django.contrib import admin
from django.urls import path
from . import views
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/login/', views.LoginView.as_view()),
    path('api/logout/', views.LogoutView.as_view()), # new
]
```
And update the Login view in the front endlike this:
```html
<template>
  <v-app>
    <v-main>
      <v-container class="fill-height">
        <v-row justify="center">
          <v-col cols="12" md="3">
            <v-card>
              <v-card-text>
                <!-- new -->
                <v-btn class="mb-3" block color="error" @click="logout" v-if="isAuthenticated">Logout</v-btn>
                <v-form @submit.prevent="login" v-if="!isAuthenticated">
                  <v-text-field v-model="credentials.username" variant="outlined" label="Username"></v-text-field>
                  <v-text-field v-model="credentials.password" variant="outlined" label="Password"></v-text-field>
                  <v-btn type="submit" block color="primary">Login</v-btn>
                </v-form>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { reactive, ref } from 'vue';
const isAuthenticated = ref(false)
const credentials = reactive({ username: "", password: "" })
const login = () => {
  fetch("/api/login/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials)
    }
  ).then(response=>{
    if(response.ok){
      isAuthenticated.value=true
    }
    return response.json()
  })
  .then(data=>console.log(data)
  )
}
// new
const logout = () => {
  fetch("/api/logout/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      }
    }
  ).then(response=>{
    if(response.ok){
      isAuthenticated.value=false
    }
    return response.json()
  })
  .then(data=>console.log(data)
  )
}
</script>
```
Now clear the session cookies and login again, after that click on the logout button, we can see that we have an error in the console panel of the browser's Devtools.
```json
{
    "detail": "CSRF Failed: CSRF token missing."
}
```
## Cross Site Request Forgery protection (CSRF)
from Django documentation:
> *The CSRF middleware and template tag provides easy-to-use protection against Cross Site Request Forgeries. This type of attack occurs when a malicious website contains a link, a form button or some JavaScript that is intended to perform some action on your website, using the credentials of a logged-in user who visits the malicious site in their browser. A related type of attack, ‘login CSRF’, where an attacking site tricks a user’s browser into logging into a site with someone else’s credentials, is also covered. The first defense against CSRF attacks is to ensure that GET requests (and other ‘safe’ methods, as defined by RFC 9110#section-9.2.1) are side effect free. Requests via ‘unsafe’ methods, such as POST, PUT, and DELETE, can then be protected by the steps outlined in How to use Django’s CSRF protection.*

for further information [see here](https://docs.djangoproject.com/en/5.1/ref/csrf/)

So we have to include the `X-CSRFToken` value in the request header for all post requests, let's update the logout function,
```js
const logout = () => {
  fetch("/api/logout/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken":getCsrfToken() // new
      }
    }
  ).then(response=>{
    if(response.ok){
      isAuthenticated.value=false
    }
    return response.json()
  })
  .then(data=>console.log(data)
  )
}
// new
const getCsrfToken = () => {
  const cookie = document.cookie.split(';')[0];
  const value = cookie.split("=")[1]
  return value
}
```
You can see, when you click on the logout button, every thing goes as you want.

## Get data with authenticated user

Now we will add a view to our backend, only authenticated users will se a message say Hello, add to views.py file the following lines:
```python
class SayHello(views.APIView):
    # This view should be accessible only for authenticated users.
    def get(self, request, format=None):
        username = request.user.username
        return Response({"message":f"Hello {username}"}, status=status.HTTP_202_ACCEPTED)
```
In the urls.py file:
```python
from django.contrib import admin
from django.urls import path
from . import views
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/login/', views.LoginView.as_view()),
    path('api/logout/', views.LogoutView.as_view()),
    path('api/hello/', views.SayHello.as_view()), # new
]
```
And finally the login view
```html
<template>
  <v-app>
    <v-main>
      <v-container class="fill-height">
        <v-row justify="center">
          <v-col cols="12" md="3">
            <v-card>
              <v-card-text>
                <!-- new -->
                <v-btn class="mb-3" block color="error" @click="logout" v-if="isAuthenticated">Logout</v-btn>
                <!-- new -->
                <h1 class="title">{{ message }}</h1>
                <v-form @submit.prevent="login" v-if="!isAuthenticated">
                  <v-text-field v-model="credentials.username" variant="outlined" label="Username"></v-text-field>
                  <v-text-field v-model="credentials.password" variant="outlined" label="Password"></v-text-field>
                  <v-btn type="submit" block color="primary">Login</v-btn>
                </v-form>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { reactive, ref } from 'vue';

const message = ref("")
const isAuthenticated = ref(false)
const credentials = reactive({ username: "", password: "" })

const login = () => {
  fetch("/api/login/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials)
    }
  ).then(response=>{
    if(response.ok){
      isAuthenticated.value=true
      sayHello()
    }
    return response.json()
  })
  .then(data=>console.log(data)
  )
}
const sayHello = () => {
  fetch("/api/hello/",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(response=>response.json())
  .then(data=>{
    message.value = data.message
  }
  )
}
//new
const logout = () => {
  fetch("/api/logout/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken":getCsrfToken() // new
      }
    }
  ).then(response=>{
    if(response.ok){
      isAuthenticated.value=false
    }
    return response.json()
  })
  .then(data=>console.log(data)
  )
}

const getCsrfToken = () => {
  const cookie = document.cookie.split(';')[0];
  const value = cookie.split("=")[1]
  return value
}
</script>
```
## Result
<div align="center">
<img src="/session-login.gif" width="100%"/>
</div>

## Final words
In this article, you learned how to set up authentication for a Django Rest Framework (DRF) application using Django's built-in session framework. This method works well if you have control over both the frontend and backend, and they are served under the same primary domain. In such cases, browser cookies can effectively maintain the user session across multiple requests. This assumption is often valid, and using this approach is generally simpler to implement compared to token-based authentication methods.

Be sure to check out my example project on [Github](https://github.com/malnossi/django-session-app), either clone or fork it to see how everything works in practice.

Enjoy working with Django Rest Framework!