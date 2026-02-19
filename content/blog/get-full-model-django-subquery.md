+++
title="Get full model instance from Django's Subquery"
date=2026-02-19
description="Django's Subquery returns Scalars, Learn How to return a full model instance"
[taxonomies]
tags=["Django","ORM"]
[extra]
[extra.cover]
image="django-subquery-full.webp"
+++

# Introduction
A large part of my recent work involves writing APIs for analytics. Not simplistic examples. Rather, the kind of queries where it's clear that someone had a perfect command of `SQL` and where you then have to convince the `ORM` to behave in the same way.

Recently, this has led me to build a lot of `annotations` based on `Subquery`.

If you've ever worked with `Subquery` in Django, you're probably familiar with its main limitation: it can only return a single column. Which is perfectly reasonable. Until you want to retrieve a complete object.

There have been several times when I've thought to myself, ***"There must be a clean way to retrieve the entire related model from this, right?"*** The obvious answer is **NO**. At least, not directly. But after a lot of experimentation and a few minor existential crises over querysets, I finally found a pattern that allows you to retrieve complete instances via a single subquery.

No hacks. No raw SQL. Just a slightly different way of exploiting how the ORM composes its queries.

To make this more concrete, I'll start simply and build the explanation gradually.
# Models
Let's start with two simple but realistic models.
```py
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.CharField(max_length=255)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
```
Now imagine the requirement, For every Post, annotate its most recent Comment.

In SQL, this might look like:
```sql
SELECT p.*, c.*
FROM post p
LEFT JOIN LATERAL (
    SELECT *
    FROM comment c
    WHERE c.post_id = p.id
    ORDER BY c.created_at DESC
    LIMIT 1
) c ON TRUE;
```
Very natural in SQL. But in Django? *Let’s try.*
# The Naïve Subquery Approach
Django gives us `OuterRef` and `Subquery`, which let us write correlated subqueries.
```py
from django.db.models import OuterRef, Subquery

latest_comment_qs = Comment.objects.filter(
    post=OuterRef("pk")
).order_by("-created_at")

posts = Post.objects.annotate(
    latest_comment_id=Subquery(
        latest_comment_qs.values("pk")[:1]
    )
)
```
Output:
```json
[
    {
        "id": 1,
        "title": "post 1",
        "created_at": "2026-02-19 12:19:18.282055+00:00",
        "latest_comment_id": 7
    },
    {
        "id": 2,
        "title": "post 2",
        "created_at": "2026-02-19 12:19:18.282266+00:00",
        "latest_comment_id": 6
    },
    {
        "id": 3,
        "title": "post 3",
        "created_at": "2026-02-19 12:19:18.282273+00:00",
        "latest_comment_id": 8
    },
    {
        "id": 4,
        "title": "post 4",
        "created_at": "2026-02-19 12:19:18.282277+00:00",
        "latest_comment_id": 9
    }
]
```
This works perfectly. Each Post now has:
```py
post.latest_comment_id
```
But notice something important: We only get the `pk`. Why?

Because `Subquery` must return exactly one column. This is not arbitrary. SQL subqueries used as expressions must resolve to a scalar value. Django is simply enforcing that constraint.

So if we try:
```py
latest_comment_qs.values("pk", "author", "body")
```
Django rightfully complains. At this point, most people conclude: ***“Okay. I can only annotate scalar values.”*** But that conclusion is slightly premature.

# JSONObject to the rescue
This was the moment I had my first truly clever,if slightly devious, idea. How do you combine two values into one? Simple: you tuck them neatly into a JSON object, of course!
```py
from django.db.models.functions import JSONObject

latest_comment_qs = Comment.objects.filter(post=OuterRef("pk")).order_by(
        "-created_at"
    )
    json_obj = JSONObject(author="author", body="body")

    posts = Post.objects.annotate(
        latest_comment=Subquery(latest_comment_qs.values_list(json_obj,flat=True)[:1])
    )
```
Output:
```json
[
    {
        "id": 1,
        "title": "post 1",
        "created_at": "2026-02-19 12:19:18.282055+00:00",
        "latest_comment": {
            "author": "Author 7",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do"
        }
    },
    {
        "id": 2,
        "title": "post 2",
        "created_at": "2026-02-19 12:19:18.282266+00:00",
        "latest_comment": {
            "author": "Author 6",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do"
        }
    },
    {
        "id": 3,
        "title": "post 3",
        "created_at": "2026-02-19 12:19:18.282273+00:00",
        "latest_comment": {
            "author": "Author 8",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do"
        }
    },
    {
        "id": 4,
        "title": "post 4",
        "created_at": "2026-02-19 12:19:18.282277+00:00",
        "latest_comment": {
            "author": "Author 9",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do"
        }
    }
]
```
**But why stop there?** If you've been following the logic so far, you might already be ahead of me. There's nothing particularly special about those two fields they just happened to be the ones I needed first. The moment I realized the pattern generalized, the natural next question was: ***can I just pull everything across? The full row, all the columns, the whole object in everything but name?***
As it turns out yes, mostly. With a bit of care around how you structure things, you can annotate with as many fields from the related model as you need. The machinery doesn't change. You're just asking more of it.

```py
json_obj = models.JSONObject(id="id", post="post", author="author", body="body", created_at="created_at")
```
JSON has opinions about types, and dates are not among the ones it tolerates. So our created_at field comes back as a string, which is the kind of thing you notice, file away as mildly irritating, and then completely forget about until it bites you in production. It's fixable, and I'll get to it, but it requires a bit more ceremony than I want to get into right now.
First, let's deal with something simpler. If you're anything like me, you probably already felt a small but persistent annoyance having to spell out every field name twice, once to build the annotation, and again to reference it. It feels like the kind of redundancy that exists only to haunt you the day you add a new field to the model and forget to update both lists.
There's a better way. This is exactly the sort of problem the `Model._meta` API was made for, it gives you programmatic access to a model's fields, which means you can stop maintaining that list by hand entirely and just let the model tell you what it knows about itself:
```py
json_obj = JSONObject(**{f.name: f.name for f in Comment._meta.get_fields()})
```
Output:
```json
[
    {
        "id": 1,
        "title": "post 1",
        "created_at": "2026-02-19 12:19:18.282055+00:00",
        "latest_comment": {
            "id": 7,
            "post": 1,
            "author": "Author 7",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282630"
        }
    },
    {
        "id": 2,
        "title": "post 2",
        "created_at": "2026-02-19 12:19:18.282266+00:00",
        "latest_comment": {
            "id": 6,
            "post": 2,
            "author": "Author 6",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282627"
        }
    },
    {
        "id": 3,
        "title": "post 3",
        "created_at": "2026-02-19 12:19:18.282273+00:00",
        "latest_comment": {
            "id": 8,
            "post": 3,
            "author": "Author 8",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282633"
        }
    },
    {
        "id": 4,
        "title": "post 4",
        "created_at": "2026-02-19 12:19:18.282277+00:00",
        "latest_comment": {
            "id": 9,
            "post": 4,
            "author": "Author 9",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282635"
        }
    }
]
```
This has all the same limitations as before strings where dates should be, the whole JSON impedance mismatch lurking underneath. But at least we're no longer maintaining a redundant field list by hand, and swapping in a different model is now a one-line change.
Still, we're not quite where we said we'd end up. If you cast your mind back to the intro, We don't need dictionaries but actual model instances, real objects, with methods, with properly typed fields, with all the affordances you'd normally expect from the ORM. Something you could hand off to existing code and have it just work, none the wiser about how it was obtained.
So let's talk about how to get there.

# Rethinking the Problem
I like thinking about the Django ORM in terms of layers. On one end, there’s the database tables, columns, rows. On the other, there’s the Django model layer Python objects with rich types and attributes. The trick is finding the right “middleman” that can translate between these layers.

In Django, that middleman is usually a models.Field subclass. These fields know how to convert a database column into the correct Python type. If you’ve used database functions in Django, you’ve probably sprinkled `output_field=SomeField()` in queries to make things work. That’s exactly what we’ll leverage here.

We can create a custom field that takes a JSON object from the database—where each key/value pair corresponds to a model field—and turns it into an actual model instance:
```py
class JSONModelField(models.JSONField):
    def __init__(self, model, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model = model

    def from_db_value(self, value, expression, connection):
        value = super().from_db_value(value, expression, connection)
        return self.model(**value)
```
Plugging this into a `Subquery` is straightforward:
```py
latest_comment_qs = Comment.objects.filter(post=OuterRef("pk")).order_by(
        "-created_at"
    )
    json_obj = JSONObject(**{f.name: f.name for f in Comment._meta.get_fields()})

    posts = Post.objects.annotate(
        latest_comment=Subquery(
            latest_comment_qs.values_list(json_obj)[:1],
            output_field=JSONModelField(Comment),
        )
    )
```
**OOPS!**
```bash
ValueError: Cannot assign "1": "Comment.post" must be a "Post" instance.
```
When a model has a foreign key, the database JSON usually only contains the ID of the related object, not the full object itself. Because foreign keys introduce this relational complexity, the `JSONModelField` approach cannot reliably construct full related objects. It only works for simple, self contained fields.

So in our solution, the safest route is to omit foreign keys from the `JSON` conversion.
```python
class JSONModelField(models.JSONField):
    def __init__(self, model, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model = model

    def from_db_value(self, value, expression, connection):
        value = super().from_db_value(value, expression, connection)
        if not value:
            return None

        field_names = {
            field.name
            for field in self.model._meta.local_concrete_fields
            if not (field.many_to_one or field.one_to_many or field.many_to_many)
        }

        merged_value = {k: value.get(k, None) for k in field_names}

        return self.model(**merged_value)
```
Output:
```json
[
    {
        "id": 1,
        "title": "post 1",
        "created_at": "2026-02-19 12:19:18.282055+00:00",
        "latest_comment": {
            "id": 7,
            "author": "Author 7",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282630"
        }
    },
    {
        "id": 2,
        "title": "post 2",
        "created_at": "2026-02-19 12:19:18.282266+00:00",
        "latest_comment": {
            "id": 6,
            "author": "Author 6",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282627"
        }
    },
    {
        "id": 3,
        "title": "post 3",
        "created_at": "2026-02-19 12:19:18.282273+00:00",
        "latest_comment": {
            "id": 8,
            "author": "Author 8",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282633"
        }
    },
    {
        "id": 4,
        "title": "post 4",
        "created_at": "2026-02-19 12:19:18.282277+00:00",
        "latest_comment": {
            "id": 9,
            "author": "Author 9",
            "body": "lorem ipsum dolor sit amet consectetur adipisicing elit sed do",
            "created_at": "2026-02-19 12:19:18.282635"
        }
    }
]
```
```py
>> print(type(posts[1].latest_comment.created_at))
>> <class 'str'>
```
There’s a catch, though. `JSON` has limited types, so fields like `created_at` might still come back as strings instead of date objects. Luckily, fields can handle this conversion via `to_python()`:

```py
class JSONModelField(models.JSONField):
    def __init__(self, model, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model = model

    def from_db_value(self, value, expression, connection):
        value = super().from_db_value(value, expression, connection)
        if not value:
            return None

        field_names = {
            field.name
            for field in self.model._meta.local_concrete_fields
            if not (field.many_to_one or field.one_to_many or field.many_to_many)
        }

        merged_value = {k: value.get(k, None) for k in field_names}

        return self.model(
            **{
                k: self.model._meta.get_field(k).to_python(v)
                for k, v in merged_value.items()
            }
        )
```

```py
>> print(type(posts[1].latest_comment.created_at))
>> <class 'datetime.datetime'>
```
Now your `Subquery` gives real model instances with proper Python types. A small tweak, but a huge payoff.
```py
>> print(type(posts[1].latest_comment))
>> <class 'Comment'>
```
# Conclusion
By really understanding Django’s layered architecture the way the database sits at one end with its tables, columns, and rows, and the Python model layer lives at the other with fully typed objects and rich methods we can take advantage of the middle layer, the fields, to do what they were designed to do: translate between raw database values and Python types. By creating a custom field that knows how to deserialize `JSON` into model instances, we can take what would otherwise be plain dictionaries or strings and turn them into fully usable Django objects, complete with type safe attributes. This approach preserves all the expressiveness and convenience of the ORM while keeping our queries clean, composable, and predictable. At the same time, we intentionally leave relational fields like foreign keys out of the JSON conversion, because they involve more complex relationships that can’t be fully represented in a flat JSON object, ensuring our solution remains robust and avoids subtle bugs. It’s a small tweak with an outsized payoff: by respecting the boundaries between layers and letting the right “middleman” handle the translation, we can extend Django’s ORM in powerful ways, making it even more flexible, intuitive, and capable of handling sophisticated queries while keeping the resulting model instances fully functional and ready for Python level logic.

Feel free to follow this link to find the [source code](https://github.com/malnossi/django-subquery-full-model)