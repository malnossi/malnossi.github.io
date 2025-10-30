+++
title="Fast & Efficient Bulk Create with Django and PostgreSQL"
date=2025-10-30
authors = ["Mohamed AL NOSSIRAT"]
description="Build Vue 3 plugin that simplifies the process of displaying notifications, alerts and confirmations in your Vue applications. It uses Vuetify components to provide a beautiful and customizable user experience."
[taxonomies]
tags=["Django","PostgreSQL","Data"]
[extra]
cover="djangopostgres.png"
cover_source="Unsplash"
+++
## Introduction
At [Munity](https://munityapps.com), our entire mission revolves around one thing: connecting systems that were never meant to talk to each other. We live and breathe external API integrations pulling data from third-party platforms, transforming it, and making it usable inside modern applications. It sounds straightforward in theory. In practice, it’s controlled chaos.
Every integration comes with its own quirks. Some APIs are beautifully documented, versioned, and predictable. Others behave like relics from a forgotten era inconsistent, rate-limited, half-deprecated, and often missing the one endpoint we actually need. Authentication can range from simple bearer tokens to corporate-grade OAuth labyrinths that break every other week.
And when APIs aren’t available? That’s when the real plumbing begins. We’ve had to fetch data from exported CSVs, ancient FTP servers, even obscure vendor portals that only work in Internet Explorer (yes, still). The reality is that a “modern” integration stack often has to accommodate everything from sleek GraphQL APIs to legacy SOAP endpoints wrapped in enterprise duct tape.
So at Munity, we’ve learned to expect the unexpected. Our work isn’t just about writing connectors it’s about designing resilient systems that can handle inconsistency, scale gracefully, and adapt when external providers change their rules overnight.
In this post, I’ll dive into the common challenges we face building and maintaining these integrations the hidden complexity behind “just connecting an API,” and how we’ve built frameworks at Munity to keep the data flowing no matter how messy the source.

To provide a real-life, workable solution, we start every integration with a few assumptions ground rules that reflect how data actually behaves in the wild:

1.	**The Data is Fetched from a Remote Source**
Whether it’s a REST API, S3 bucket, or a private FTP, the data always lives elsewhere. We don’t control its shape, format, or availability — but we must handle it reliably, regardless of latency, authentication quirks, or inconsistent delivery.

2.	**The Data is Dirty and Needs to Be Transformed**
Even the cleanest APIs leak edge cases. We expect malformed fields, missing relationships, duplicated records, and inconsistent types. Normalization, validation, and transformation aren’t “extra steps” they’re the core of the pipeline.

3.	**The Data is Big**
Real integrations don’t deal in kilobytes. They deal in gigabytes, sometimes terabytes. That means pagination, batching, streaming, and efficient storage aren’t nice-to-haves they’re essential for performance and scalability.

With these realities in mind, we’ve built our internal frameworks and practices to make external data integration repeatable, predictable, and scalable no matter how messy the source or how complex the system on the other end.

## Setup
### The External API
I will use the [JSONPlaceholder](https://jsonplaceholder.typicode.com/photos), it's a fake api and though we could mock an external API call
```bash
curl https://jsonplaceholder.typicode.com/photos
```
```json
[
  {
    "albumId": 1,
    "id": 1,
    "title": "accusamus beatae ad facilis cum similique qui sunt",
    "url": "https://via.placeholder.com/600/92c952",
    "thumbnailUrl": "https://via.placeholder.com/150/92c952"
  },
  {
    "albumId": 1,
    "id": 2,
    "title": "reprehenderit est deserunt velit ipsam",
    "url": "https://via.placeholder.com/600/771796",
    "thumbnailUrl": "https://via.placeholder.com/150/771796"
  },
  //
]
```
### Project Setup
```bash
mkdir djangopostgres && cd djangopostgres
uv init .
uv add django psycopg2-binary
uv run django-admin create-project config .
```
### Docker for the PostgreSQL Database
```yml
services:
  db:
    image: postgres:18
    ports:
      - 5432:5432
    environment:
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
      - POSTGRES_DB=django

```
```bash
docker compsoe up -d
```
In the project's `settings.py` file change the `DATABASES` dict as follwing:

```python

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "django",
        "USER": "test",
        "PASSWORD": "test",
        "HOST": "localhost",
        "PORT": "5432",
    }
}
```
```bash
python manage.py startapp photos
```
Add the `photos`app to the Django's `INSTALLED_APPS`
```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "photos", # new
]
```
And modify in the `photos` application `models.py` as folllowing:
```python
from django.db import models

class Photo(models.Model):

    title = models.CharField(max_length=255)
    url = models.URLField(max_length=255)
    raw_data = models.JSONField(default=dict)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "photos"
```
```bash
python manage.py makemigraions
python manage.py migrate

```
For this article, I will implement the features in the “management commands” file, but you can imagine that these functions could live in a Celery task or in a gRPC service. for further information about Django's management commands please refer to the [Documentation](https://docs.djangoproject.com/en/5.2/howto/custom-management-commands/)

### Fetch the photos from the API
```python
import requests
from typing import Iterator, Dict, Any

def get_photos() -> Iterator[Dict[str, Any]]:
    session = requests.Session()
    response = session.get("https://jsonplaceholder.typicode.com/photos")
    response.raise_for_status()
    yield from response.json()
```
### Profile decorator
```python
def profile(fn):
    @wraps(fn)
    def inner(*args, **kwargs):
        print(f"\n{fn.__name__}")
        tracemalloc.start()
        t0 = time.perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            elapsed = time.perf_counter() - t0
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            print(f"Time   {elapsed:0.4f}s")
            print(f"Memory {peak / (1024**2):.3f} MiB (peak)")

    return inner
```
This `@profile` decorator is a lightweight performance tool that measures how long a function takes to run and how much memory it consumes at its peak. It uses Python’s built-in `tracemalloc` module to track memory allocations and `time.perf_counter()` for precise timing. When applied to a function, it starts monitoring before execution, runs the function once, and then reports the total execution time and maximum memory usage in a clean, readable format. It helps identify performance bottlenecks and memory inefficiencies without requiring external profilers.

### Implemntation
Currently, the Jsonplaceholder Photos API only contains 5,000 entries, so to work with a large dataset, I will multiply the list by 100, giving us 500K entries.
```bash
>>> photos = list(get_photos())*100
>>> len(photos)
500000
```
### Django ORM Bulk Create
```python
@profile
def insert_django_bulk_create(photos: Iterator[Dict[str, Any]]):

    Photo.objects.bulk_create(
        [
            Photo(**dict(title=photo["title"], url=photo["url"], raw_data=photo))
            for photo in photos
        ],
    )
```
For this we will have a commande in `load_data.py`file:
```python
class Command(BaseCommand):
    help = "Load Data from External API"

    def handle(self, *args, **options):
        insert_django_bulk_create(photos=photos)
        self.stdout.write(self.style.SUCCESS("Successfully Loaded Data to Photos"))
```
```bash
python manage.py load_data

insert_django_bulk_create
Time   45.0054s
Memory 627.871 MiB (peak)
Successfully Loaded Data to Photos
```
The profiling results show that the `insert_django_bulk_create` function took **45 seconds** to execute and used up to **627.87 MB** of memory at its peak. This indicates that while Django’s `bulk_create` method efficiently reduces the number of database insert queries, it still consumes a significant amount of memory because all the `Photo` objects are instantiated and held in memory before being written to the database. Such a large memory footprint and relatively long execution time suggest that this approach may not scale well for very large datasets.

### COPY
The official PostgreSQL documentation includes a dedicated section on Populating a Database, which highlights that the most efficient method for loading large amounts of data is the `COPY` command. In Python, the `psycopg` library offers a convenient interface for this through the `copy_from` function. Since the COPY command works with CSV input, the idea is to first convert our dataset into a CSV format and then use copy_from to stream the data directly into the database, the Django’s underlying database connection cursor will have `copy_from`, `copy_to`, and `copy_expert` methods available. You can read their full API [documentation](https://www.psycopg.org/docs/usage.html#using-copy-to-and-copy-from).

```python
import io
@profile
def insert_string_io(photos: Iterator[Dict[str, Any]]):
    columns = ("title", "url", "raw_data")
    csv_file_like_object = io.StringIO()
    for photo in photos:
        csv_file_like_object.write(
            "|".join((photo["title"], photo["url"], json.dumps(photo))) + "\n"
        )
    csv_file_like_object.seek(0)
    with connection.cursor() as cursor:
        cursor.copy_from(csv_file_like_object, "photos", sep="|", columns=columns)
```
Change the code in `load_data.py`file:
```python
class Command(BaseCommand):
    help = "Load Data from External API"

    def handle(self, *args, **options):
        # insert_django_bulk_create(photos=photos)
        insert_string_io(photos=photos)
        self.stdout.write(self.style.SUCCESS("Successfully Loaded Data to Photos"))
```
```bash
python manage.py load_data

psycopg2.errors.NotNullViolation: null value in column "created" of relation "photos" violates not-null constraint
DETAIL:  Failing row contains (5001, accusamus beatae ad facilis cum similique qui sunt, https://via.placeholder.com/600/92c952, {"id": 1, "url": "https://via.placeholder.com/600/92c952", "titl..., null, null).
CONTEXT:  COPY photos, line 1: "accusamus beatae ad facilis cum similique qui sunt|https://via.placeholder.com/600/92c952|{"albumId"..."
```
The message is clear: we are trying to insert values into the database without specifying the values for the `created` and `updated` columns, thereby violating the `not-null` constraint. However, if we look at the code in our `Photo` model, we see that we have added the two parameters `auto_now=True` and `auto_now_add=True`. Why is this happening? 
```py
from django.db import models


class Photo(models.Model):
	# //code
    created = models.DateTimeField(auto_now_add=True) # here
    updated = models.DateTimeField(auto_now=True) # here

	# //code
```
> The field is only automatically updated when calling `Model.save()`. The field isn’t updated when making updates to other fields in other ways such as `QuerySet.update()`, though you can specify a custom value for the field in an update like that.

When you call Model.save(), Django runs extra Python logic, like automatically updating auto_now or auto_now_add fields, running model signals `pre_save`, `post_save`, and handling field defaults. However, when you use `QuerySet.update()`, Django bypasses all of that and sends a direct `SQL UPDATE` to the database without calling `.save()` on each object. Because of that, the database itself doesn’t know about Django’s automatic updates it just updates the specified columns. So the rule is: the auto-update behavior is controlled by Django’s model system in Python, not by the database engine.

We can verify this by looking at the SQL code that was generated by the migration.
```bash
python manage.py sqlmigrate photos 0001  
```
```sql
BEGIN;
--
-- Create model Photo
--
CREATE TABLE "photos" (
	"id" bigint NOT NULL PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, 
	"title" varchar(255) NOT NULL, 
	"url" varchar(255) NOT NULL, 
	"raw_data" jsonb NOT NULL, 
	"created" timestamp with time zone NOT NULL, 
	"updated" timestamp with time zone NOT NULL
	);
COMMIT;
```
As you can see, the two columns `created` and `updated` have the `NOT NULL` constraint, but there is nothing to indicate that we want the database to fill them with a default value.

To solve this problem, we have two solutions:
1.  Explicitly set these two values in our Python code.
2.  Change the SQL code generated by my migration to automatically add these two values to the database.

#### 1- Explicitly set values in Python code.
In the Django documentation we can see this in the section of [DateField](https://docs.djangoproject.com/en/5.2/ref/models/fields/#datefield)
<blockquote>
<strong>DateField.auto_now_add</strong>

Automatically set the field to now when the object is first created. Useful for creation of timestamps. Note that the current date is always used; it’s not just a default value that you can override. So even if you set a value for this field when creating the object, it will be ignored. If you want to be able to modify this field, set the following instead of `auto_now_add=True`:

* For DateField: `default=date.today` - from `datetime.date.today()`
* For DateTimeField: `default=timezone.now` - from `django.utils.timezone.now()`
</blockquote>

```python
import io
import json
from django.db import connection
from django.utils import timezone  # new
from typing import Iterator, Dict, Any

@profile
def insert_string_io(photos: Iterator[Dict[str, Any]]):
    columns = ("title", "url", "raw_data", "created", "updated")
    csv_file_like_object = io.StringIO()
    now = timezone.now().isoformat() # new
    for photo in photos:
        csv_file_like_object.write(
            "|".join((photo["title"], photo["url"], json.dumps(photo), now, now)) + "\n"
        )
    csv_file_like_object.seek(0)
    with connection.cursor() as cursor:
        cursor.copy_from(csv_file_like_object, "photos", sep="|", columns=columns)
```
Now run the script again
```bash
python manage.py load_data

insert_string_io
Time   9.8585s
Memory 793.827 MiB (peak)
```
So, we have a slight improvement in execution time compared to the `bulk_create` version, but we are consuming more memory. The `insert_string_io` function was executed, it took approximately **10** seconds to complete and used about **793.83** megabytes of memory at its highest point during execution. Which suggests that the function was handling a large amount of data in memory (buffering a big CSV) before writing or inserting it.

#### 2- Change the SQL code generated by my migration
You can safely add the SQL changes (like adding DEFAULT CURRENT_TIMESTAMP or creating an update trigger) in a separate migration file such as 0002_auto_add_timestamps.py.
That’s actually the **best practice**, because you keep Django’s auto-generated schema (0001_initial.py) clean and version-controlled by Django, while your custom SQL lives in a clearly separate migration.

Create a `0002_auto_add_timestamps.py`file unser the `photos/migrations` folder and modify it as follwing:
```python
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("photos", "0001_initial"),  # depends on your first migration
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE photos
            ALTER COLUMN created SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN updated SET DEFAULT CURRENT_TIMESTAMP;

            -- Function to auto-update the "updated" column on UPDATE
            CREATE OR REPLACE FUNCTION update_updated_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            -- Trigger that calls the function on every update
            DROP TRIGGER IF EXISTS set_timestamp ON photos;
            CREATE TRIGGER set_timestamp
            BEFORE UPDATE ON photos
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_column();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS set_timestamp ON photos;
            DROP FUNCTION IF EXISTS update_updated_column();
            ALTER TABLE photos
            ALTER COLUMN created DROP DEFAULT,
            ALTER COLUMN updated DROP DEFAULT;
            """,
        ),
    ]
```
Now run the migration command
```bash
python manage.py migrate
```
Change the code in `load_data.py` file
```python
import io
import json
from django.db import connection
from typing import Iterator, Dict, Any

@profile
def insert_string_io(photos: Iterator[Dict[str, Any]]):
    columns = ("title", "url", "raw_data")
    csv_file_like_object = io.StringIO()
    now = timezone.now().isoformat() # new
    for photo in photos:
        csv_file_like_object.write(
            "|".join((photo["title"], photo["url"], json.dumps(photo))) + "\n"
        )
    csv_file_like_object.seek(0)
    with connection.cursor() as cursor:
        cursor.copy_from(csv_file_like_object, "photos", sep="|", columns=columns)
```
```bash
python manage.py load_data

insert_string_io
Time   9.4409s
Memory 636.471 MiB (peak)
Successfully Loaded Data to Photos
```
As you can see, the execution time has not changed, but we are using slightly less memory.

### Copy Data From a String Iterator
One of the key limitations of using `COPY` with `StringIO` is that the entire dataset is first built and stored in memory, which can quickly become inefficient or even unmanageable for large imports. A more scalable approach is to create a streaming, `file-like` buffer that acts as an intermediary between the remote data source and the PostgreSQL `COPY` command. Instead of loading all data at once, this buffer would consume JSON records incrementally through an iterator, performing any necessary cleaning, validation, or transformation on each record before yielding a properly formatted CSV row. This streaming design dramatically reduces memory usage, improves performance on large datasets, and allows continuous ingestion of data without waiting for the entire file to be generated upfront.

<div align="center">
<img src="/copy-diagram.svg" width="100%"/>
</div>

You can refer to this [stack overflow answer](https://stackoverflow.com/questions/12593576/adapt-an-iterator-to-behave-like-a-file-like-object-in-python/12604375#12604375) to created an object that feeds off an iterator, and provides a file-like interface:

```python
from typing import Iterator, Optional
import io

class StringIteratorIO(io.TextIOBase):
    def __init__(self, iter: Iterator[str]):
        self._iter = iter
        self._buff = ''

    def readable(self) -> bool:
        return True

    def _read1(self, n: Optional[int] = None) -> str:
        while not self._buff:
            try:
                self._buff = next(self._iter)
            except StopIteration:
                break
        ret = self._buff[:n]
        self._buff = self._buff[len(ret):]
        return ret

    def read(self, n: Optional[int] = None) -> str:
        line = []
        if n is None or n < 0:
            while True:
                m = self._read1()
                if not m:
                    break
                line.append(m)
        else:
            while n > 0:
                m = self._read1(n)
                if not m:
                    break
                n -= len(m)
                line.append(m)
        return ''.join(line)
```

```python
import io
import json
from django.db import connection
from typing import Iterator, Dict, Any
@profile
def insert_buffer_string_io(photos: Iterator[Dict[str, Any]]):
    columns = ("title", "url", "raw_data")
    csv_file_like_object = StringIteratorIO(
        ("|".join((photo["title"], photo["url"], json.dumps(photo)))) + "\n"
        for photo in photos
    )
    with connection.cursor() as cursor:
        cursor.copy_from(csv_file_like_object, "photos", sep="|", columns=columns)
```
>Here we didn't add `created` and `updated` to the comumns neither the values beacuse we had made a SQL migration before, so if you stock with the pythonic way the function should look like this:
```python
import io
import json
from django.db import connection
from django.utils import timezone  # new
from typing import Iterator, Dict, Any

@profile
def insert_buffer_string_io(photos: Iterator[Dict[str, Any]]):
    columns = ("title", "url", "raw_data","created","updated")
	now = timezone.now().isoformat() # new
    csv_file_like_object = StringIteratorIO(
        ("|".join((photo["title"], photo["url"], json.dumps(photo), now, now))) + "\n"
        for photo in photos
    )
    with connection.cursor() as cursor:
        cursor.copy_from(csv_file_like_object, "photos", sep="|", columns=columns)
```

Change the `load_data.py`command
```python
class Command(BaseCommand):
    help = "Load Data from External API"

    def handle(self, *args, **options):
        # insert_django_bulk_create(photos=photos)
        #insert_string_io(photos=photos)
		insert_buffer_string_io(photos=photos)
        self.stdout.write(self.style.SUCCESS("Successful
```
```bash
python manage.py load_data   

insert_buffer_string_io
Time   8.6109s
Memory 0.022 MiB (peak)
```
The insert_buffer_string_io operation completed in **8.6109** seconds and reached a peak memory usage of only **0.022** MiB. This means the process took a moderate amount of time to execute but was extremely memory-efficient. The low memory footprint suggests that data was handled incrementally—likely using a streaming or buffered approach—rather than being fully loaded into memory at once.
```bash
psql (18.0 (Debian 18.0-1.pgdg13+3))
Type "help" for help.

django=# select count(id) from photos;
 count  
--------
 500000
(1 row)
```
### Github Repo
[Source Code](https://github.com/malnossi/djangopostgrescopy)
### Conclusion
You might wonder which approach to choose and, as always, the honest answer is "it depends". The key takeaway is to stay aware of the potential side effects that could impact your project.

Here are a few important considerations:
- If you’re working with multiple databases or complex routing, ensure that your Django model is connected to the correct database.
- Copy operations do not trigger Django model signals such as `pre_save` or `post_save`.
- Despite these caveats, using `copy_from` methods offers a substantial performance boost over `bulk_create`, which itself is already faster than inserting records one by one.

**This article was inspired by [Haki Benita's article](https://hakibenita.com/fast-load-data-python-postgresql), so thank you to him for his wonderful work.**