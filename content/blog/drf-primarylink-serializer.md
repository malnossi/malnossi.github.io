+++
title="Django Rest Framework rich related serializer"
date=2024-08-23
authors = ["Mohamed AL NOSSIRAT"]
description="Django REST framework is a powerful and flexible toolkit for building Web APIs. It is built on top of the popular Django web framework. It allows developers to quickly create APIs that various clients, including web, mobile, and desktop applications. In this article I would like to share with you a tip that helped me alot to improve the developer experience."
[taxonomies]
tags=["Django","Drf","Python"]
[extra]
cover="pro_django.avif"
cover_source="Unsplash"
+++
# Introduction
[Django REST Framework](https://www.django-rest-framework.org/) is an amazing librairy built on top of Python's most powerful web framework [Django](https://docs.djangoproject.com/). It is one of the best features to add to Django. But as always, nothing is perfect and to get the best out of this framework, you have to tinker with a few things around it.
There's always one thing that annoys me when I use this framework, that's how serializers behave when it comes to retrieving and validating data.
## Example
Let's imagine that we have theses Models:
```python
from rest_framework import serializers
from .models import (Department, Employee,)


class DepartmentSerializer(serializers.ModelSerializer):

    class Meta:

        model = Department
        fields = '__all__'


class EmployeeSerializer(serializers.ModelSerializer):

    class Meta:

        model = Employee
        fields = '__all__'
```
> *I assume that you know how to build views or viewsets and write the urlpatterns to use an api which expose Employees and Departments, if not! It's time to go and look at the DRF and Django documentations.*
## What we can get
Choices that we can get from this example:
```js
// GET /api/v1/employees/1
{
    "id":1,
    "employee_name":"mohamed",
    "department":1
}
```
Not so practical to read, we want more information about the department. But so efficient when writing
```js
//POST /api/v1/employees/
{
    "id":2,
    "employee_name":"another employee_name that we want to create",
    "department":1
}
```
We can play with depth property of the serializer by example
```python
class EmployeeSerializer(serializers.ModelSerializer):

    class Meta:

        model = Employee
        fields = '__all__'
        depth = 1
```
We get this
```js
// GET /api/v1/employees/1
{
    "id":1,
    "employee_name":"mohamed",
    "department":{
        "id":1,
        "name":"Information technology"
    }
}
```
But if we want to create a new ```employee_name``` we should send all the department object again, here in this example we don't have so much informations but what if we have a model with multiple nested relations, it will be so annoying
```js
// POST /api/v1/employees/
{
    "id":1,
    "employee_name":"mohamed",
    "department":{
        "id":1,
        "name":"Information technology",
        "section":1
    },
    "issues":[
        {
            "id":1,
            "title":"Optimizing fetch in the frontend"
        }
    ]
    // and so go on
}
```
# Solutions
## 1- Use nested serializers
We can here use the DepartmentSerializer to retrieve the nested relation informations. But this will be a read only field as described in DRF documentation:

> *By default nested serializers are read-only. If you want to support write-operations to a nested serializer field you'll need to create create() and/or update() methods in order to explicitly specify how the child relationships should be saved "Django REST Framework documentation" you can see [here](https://www.django-rest-framework.org/api-guide/relations/#writable-nested-serializers)*
```python
class EmployeeSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer() # assume you have created the Departement serializer class
    class Meta:

        model = Employee
        fields = '__all__'

    def create(self,validated_data):
        department_data = validated_data.pop('department')
        department = Department.objects.create(**department_data)
        employee = Employee(department=department,**validated_data)
        employee.save()
        return employee

    def update(self,instance, validated_data):
        department = validated_data.pop('department')
        department, created = Department.objects.get_or_create(**department_data)
        instance.department = department
        instance.save()
        return instance
```
Again, here we have a very simple example, but with multiple nested serializers this will become very long and very hard to maintain. So very good solution to read data but not so easy to write these relations

## 2- Use two serializers one to read data and the other to write it
We can use two serializers to make it easier to read and write data. However, we need to change the behaviour of our views or viewsets. So, to read the data (with GET http verb) or with (list, retrieve viewset actions) we use the ReadSerializer and to write the data with (POSt, PUT http verbs) or with (create, update viewset actions) we use the WriteSerializer.
```python
from rest_framework import serializers

class EmployeeReadSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer()

    class Meta:

        model = Employee
        fields = '__all__'

class EmployeeWriteSerializer(serializers.ModelSerializer):

    class Meta:

        model = Employee
        fields = '__all__'
```
And in the ViewSet or View we can override the get_serializer_class methode to explicitly specify which serializer to use depending on which action we make:
```python
from rest_framework import viewsets

from .models import Employee
from .serializers import (EmployeeReadSerializer, EmployeeWriteSerializer,)

class EmployeeViewSet(viewsets.ModelViewSet):

    queryset = Employee.objects.all()

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return EmployeeWriteSerializer
        return EmployeeReadSerializer
```
This solution may work, but you're writing almost the same serializer twice, and you're overriding the method in the viewset, so there's more code to write. Not very funny.
## 3- The PrimaryKeyRelatedField
Finally, we come to the purpose of this article. Here I'm going to tell you about this little trick I found.

Looking at the DRF [source-code](https://github.com/encode/django-rest-framework/tree/master), especially the ModelSerializer class, I noticed that it automatically generates a `PrimaryKeyRelatedField` for the model's relationships. which itself makes the link via the Id.

So, the idea here is to inherit from this Class in order to build our own PrimaryKeyRelatedField:
```python
from collections import OrderedDict
from rest_framework import serializers

# Here I give this class the name of TheAmazingField you can name it whatever you want

class TheAmazingField(serializers.PrimaryKeyRelatedField):

    def __init__(self,serializer, many=False,*args,**kwargs) -> None:
        super().__init__(*args,**kwargs)
        self.serializer = serializer
        self.many=many

    # When read data we need all the serialized object not only the Id
    def to_representation(self,value):
        return self.serializer(instance=value, many=self.many).data

    """
    I use a small but not mandatory trick to help you reduce typing:
    make sure the queryset of the serialized model is automatically
    inherited. I am very lazy
    """
    def get_queryset(self):
        if self.queryset:
            return self.queryset
        return self.serializer.Meta.model.objects.all()

    """
    Get choices is used by the DRF autodoc and expects to_representation()
    to return an ID, which causes everything to crash.
    We rewrite the trick to use item.pk instead of to_representation()
    """
    def get_choices(self, cutoff=None):
        queryset = self.get_queryset()
        if queryset is None:
            return {}

        if cutoff is not None:
            queryset = queryset[:cutoff]

        return OrderedDict([
            (
                item.pk,
                self.display_value(item)
            )
            for item in queryset
        ])

        """
        DRF skips certain validations when there is only the id,
        and as this is not the case here, everything crashes. We disable this.
        """
        def use_pk_only_optimization(self):
        return False
```
Then we can use it like this:
```python
class EmployeeSerializer(serializers.ModelSerializer):
    department = TheAmazingField(serializer=DepartmentSerializer)
    class Meta:
        model = Employee
        fields = '__all__'
```
So when we POST a new employee to the endpoint:
```js
// POST api/v1/employees/
{
    "department": 1,
    "employee_name": "this works"
}
```
The response of the API will retrieve directly the department object 🎉
```js
{
    "id": 1,
    "department": {
        "id": 1,
        "name": "Information Technology"
    },
    "employee_name": "this works"
}
```
# Final words
I don't claim to be an expert on Django's REST Framework, but the solution I've found here has enabled me to make progress on my projects, and when I've presented it to my colleagues, they've been pleased. However, I'd be happy to talk to anyone who would like to improve or criticise this solution.

Also, you can refer to this [github repo](https://github.com/malnossi/theamazingfield) if you want to see the source-code of the solution I mentioned in this article.