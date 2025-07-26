+++
authors=["Mohamed AL NOSSIRAT"]
date=2025-07-26
title="Django & DRF Model Generic Auth Stuff"
description="Django is one of the most popular backend web application frameworks that exists and it's written in Python. Vue.js is one of the most popular JavaScript tools for adding dynamic features to a web application.Django doesn't need Vue to run. Vue doesn't need Django to run. The combination gives developers an incredibly flexible and dynamic paradigm while also leveraging a number of the built-in benefits that each tool has."
[extra]
cover="djangodrf.png"
cover_source="Unsplash"
[taxonomies]
tags=["Django","Web","Python","DRF"]
+++

## Introduction
Recently, I worked on a project using Django and Django Rest Framework (DRF). One of the key functional requirements of the project was to track the history of model modifications by keeping information about the user who created each record and the user who last updated it.

Specifically, we needed to implement a mechanism that would automatically record:
1.	The creator of the model (created_by).
2.	The user who performed the last modification (updated_by), 

each time the data was updated.

Very basic and classic requirement
## Alright, let's start to code
### Core Audit Mixin
```py
# common/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL

class AuditModelMixin(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    created_by = models.ForeignKey(
        User,
        related_name="%(class)s_created",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        editable=False,
    )
    updated_by = models.ForeignKey(
        User,
        related_name="%(class)s_updated",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        editable=False,
    )

    class Meta:
        abstract = True
```
### Example Model
```py
# todos/models.py
from django.db import models

# Create your models here.
# apps/todos/models.py
from django.db import models
from common.models import AuditModelMixin


class Todo(AuditModelMixin):
    title = models.CharField(max_length=255)
    done = models.BooleanField(default=False)

    def __str__(self):
        return self.title

```
### Migrations
```bash
python manage.py makemigrations && python manage.py mograte
```
## Set Auth User to the Model
### First Solution
#### The serializer
```py
# todos/serializers.py
from rest_framework import serializers
from .models import Todo

class TodoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Todo
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
```
#### The ViewSet
```py
# todos/views.py
from rest_framework import viewsets, permissions
from .models import Todo
from .serializers import TodoSerializer

class TodoViewSet(viewsets.ModelViewSet):
    queryset = Todo.objects.all()
    serializer_class = TodoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
```
create two users or superuser; here for this example I created a adminuser and a classicuser for the test

Set the urls in the todos app and in the main urls.py file
```python
# todos/urls.py
from rest_framework import routers
from . import views

router = routers.DefaultRouter()

router.register(prefix=r"todos", viewset=views.TodoViewSet, basename="todos")


urlpatterns = router.urls

```

```py
# config/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [path("admin/", admin.site.urls), path("", include("todos.urls"))]
```
Run the dev server
```bash
python manage.py runserver
```
> Go to [http://localhost:8000/admin/](http://localhost:8000/admin/) and login as adminuser then go to [http://localhost:8000/todos/](http://localhost:8000/todos/) and add a Todo entry.[]

The reponse should be something like this
```json
{
    "id": 1,
    "created_at": "2025-07-26T12:34:42.100587Z",
    "updated_at": "2025-07-26T12:34:42.100951Z",
    "title": "Do the code",
    "done": false,
    "created_by": 2,
    "updated_by": 2
}
```
Now Logout and re-login with another user; here I will log in with the classic user and modify the first todo to put done to true
the response should be like this
```json
{
    "id": 1,
    "created_at": "2025-07-26T12:34:42.100587Z",
    "updated_at": "2025-07-26T12:38:34.335263Z",
    "title": "Do the code",
    "done": true,
    "created_by": 2,
    "updated_by": 3
}
```
So the To do was created by the user with the id 2 and modified by the user with the id 3

Every thing works as expected

> I don’t like this solution because I have to override every viewset. A better approach might be to create a parent viewset class that inherits from the other viewsets and overrides the perform_create and perform_update methods. However, I don’t like placing business logic in the view layer; I prefer handling these modifications in the serializer layer.

### Second solution
#### The serializers
```py
# common/serializers.py
from rest_framework import serializers


class AuditSerializerMixin(serializers.Serializer):
    created_by = serializers.HiddenField(
        default=serializers.CreateOnlyDefault(serializers.CurrentUserDefault())
    )
    updated_by = serializers.HiddenField(default=serializers.CurrentUserDefault())
```
```py
# todos/serializers.py
from rest_framework import serializers
from common.serializers import AuditSerializerMixin
from .models import Todo

class TodoSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Todo
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
```

```py
# todos/views.py
from rest_framework import viewsets, permissions
from .models import Todo
from .serializers import TodoSerializer


class TodoViewSet(viewsets.ModelViewSet):
    queryset = Todo.objects.all()
    serializer_class = TodoSerializer
    permission_classes = [permissions.IsAuthenticated]
```

No create another Todo entry the response should be like this
```json
{
    "id": 2,
    "created_at": "2025-07-26T12:52:47.821956Z",
    "updated_at": "2025-07-26T12:52:47.822179Z",
    "title": "This is the second Test",
    "done": false
}
```
> We can notice that the created_at and the updated_at no longer presented in the respone;
> 	serializers.HiddenField is a DRF field that is never exposed to the client (it’s not required in request data and not shown in browsable API forms).
> Instead, it is filled automatically by a default value or function provided in its default argument.

> The Role of CurrentUserDefault and CreateOnlyDefault
> * CurrentUserDefault(): A DRF default class that returns request.user automatically.
> * CreateOnlyDefault(default): A wrapper that ensures the default value is only set when creating objects, and not overwritten during updates.

So to solve this problem we can override the to_representation method on the AuditSerializerMixin like this
```py
# common/serializers.py
from rest_framework import serializers


class AuditSerializerMixin(serializers.Serializer):
    created_by = serializers.HiddenField(
        default=serializers.CreateOnlyDefault(serializers.CurrentUserDefault())
    )
    updated_by = serializers.HiddenField(default=serializers.CurrentUserDefault())

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep["created_by"] = instance.created_by.id
        rep["updated_by"] = instance.updated_by.id
        return rep
```

re create another Todo entry and every thing will work, the response should be something like this
```json
{
    "id": 3,
    "created_at": "2025-07-26T13:00:19.686324Z",
    "updated_at": "2025-07-26T13:00:19.686846Z",
    "title": "This will Work",
    "done": true,
    "created_by": 3,
    "updated_by": 3
}
```
Now login as the adminuser and modify the Todo with the id 3 and put the done to false
the response should be like this
```json
{
    "id": 3,
    "created_at": "2025-07-26T13:00:19.686324Z",
    "updated_at": "2025-07-26T13:04:16.150382Z",
    "title": "This will Work",
    "done": false,
    "created_by": 3,
    "updated_by": 2
}
```
## Github Repository
[Django Drf Audit](https://github.com/malnossi/djangodrfdryaudit)
## Conclusion
The HiddenField approach in Django Rest Framework is a cleaner and more maintainable solution for automatically managing audit fields like created_by and updated_by. Unlike the traditional method of overriding perform_create and perform_update in each ViewSet, this approach moves the responsibility to the serialization layer, which is the natural place for handling data preparation and validation before it reaches the database. This not only reduces boilerplate code and keeps ViewSets focused solely on request handling and permissions, but also strengthens data integrity, as these fields are completely hidden from the client and cannot be tampered with. By leveraging CurrentUserDefault and CreateOnlyDefault, the serializer ensures that created_by is set only once during object creation while updated_by is updated on every modification, guaranteeing consistent behavior across all endpoints. Ultimately, this architecture aligns with DRF’s design philosophy by making the serializer the single source of truth for how data is processed, resulting in a more scalable, secure, and DRY codebase.