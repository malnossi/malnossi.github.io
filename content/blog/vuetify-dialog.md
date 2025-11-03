+++
title="Vue & Vuetify Composable Confirm Dialogs"
date=2024-08-28
description="Create reusable confirm dialogs in Vue using Vuetify’s dialog component. The article shows a Dialog.vue component and a useDialog composable to programmatically trigger confirm/cancel prompts from anywhere in your app"
[taxonomies]
tags=["Vuejs","Vuetify","Javascript"]
[extra]
[extra.cover]
image="vuetify.avif"
+++
## Introduction
[Vuetify](https://vuetifyjs.com/), a popular Material Design framework for [Vue](https://vuejs.org/), provides a wide range of UI components, including highly customizable dialogs. This article will guide you through building composable programmatic dialogs using Vue and Vuetify, allowing you to manage dialogs efficiently and flexibly.Creating programmatic dialogs in Vue using Vuetify allows developers to dynamically generate dialogs that enhance the user experience without cluttering the template with numerous dialog components.
## Project Setup
```bash
## with npm
npm create vuetify@latest
## with yarn
yarn create vuetify
## with pnpm
pnpm create vuetify
## with bun
bun create vuetify

```

## Create the Dialog component

Create a new dialog component in `src/components`, here I will create a file names `Dialog.vue`
```bash
touch src/dialogs/Dialog.vue
```
The content of this file is :
```html
<template>
    <v-dialog v-model="open" width="50%" persistent max-width="60%">
        <v-card :title="title">
            <v-card-text>{{ message }}</v-card-text>
            <v-card-actions>
                <v-btn color="success" @click="submitDialog">{{ submitText }}</v-btn>
                <v-btn color="error" @click="cancelDialog">{{ cancelText }}</v-btn>
            </v-card-actions>
        </v-card>

    </v-dialog>
</template>
<script setup>
const open = defineModel({ default: false, type: Boolean })
const emits = defineEmits(["submit", "cancel"])
const props = defineProps({
    title: {
        type: String,
        default: () => ("Attention"),
    },
    message: {
        type: String,
        default: () => (null),
    },
    submitText: {
        type: String,
        default: () => ("Submit"),
    },
    cancelText: {
        type: String,
        default: () => ("Cancel"),
    }
}
)
const submitDialog = () => {
    emits('submit')
    open.value=false
}
const cancelDialog = () => {
    emits('cancel')
    open.value=false
}
</script>
```
* **`<v-dialog>`**: A Vuetify component that creates a modal dialog box. 
* `persistent`: Prevents the user from closing the dialog by clicking outside of it. 
* `:title="title"`: Binds the `title` prop to the card title. 
* **`<v-btn color="success">`**: A button with a green color labeled with the `submitText` prop (default is "Submit"). 
* **`<v-btn color="error">`**: A button with a red color labeled with the `cancelText` prop (default is "Cancel").

And in the script section
* **`const open = defineModel({ default: false, type: Boolean })`**: This line creates a reactive `open` property with a default value of `false` and specifies that it should be of type `Boolean`. This property controls whether the dialog is visible. 
* **`const emits = defineEmits(["submit", "cancel"])`**: Defines events that the component can emit, namely "submit" and "cancel". These events would typically be triggered when the corresponding buttons are clicked, but they are not explicitly emitted in the current code. 
* **`const props = defineProps({ ... })`**: Defines the properties (`props`) that the component accepts: 
    * `title`: A `String` prop with a default value of "Attention". 
    * `message`: A `String` prop that defaults to `null`. 
    * `submitText`: A `String` prop with a default value of "Submit". 
    * `cancelText`: A `String` prop with a default value of "Cancel".

## Create Composable file
```bash
mkdir -p src/composables && touch /src/composable/useDialog.js
```
In the `useDialog.js` file copy and past this coce :
```js
import { createApp, mergeProps } from 'vue'
import Dialog from '@/components/Dialog.vue'
import vuetify from '@/plugins/vuetify'

export const getVAppRoot = () => document.body
export const createContainer = () => document.createElement('div')

export const useDialog = (props) => {    
    const rootElement = getVAppRoot()
    const container = createContainer()
    return new Promise((resolve) => {
        const componentApp = createApp(Dialog, mergeProps(
            props,
            { modelValue: true },
            {
                onSubmit() {
                    resolve(true)
                },
                onCancel() {
                    resolve(false)
                }
            }
        ))
        rootElement.appendChild(container)
        componentApp.use(vuetify).mount(container)
    })
}
```
## Usage
```html
<template>
  <v-container class="fill-height">
    <v-btn @click="clickedAsync">Click Async</v-btn>
    <v-btn @click="clickedThen">Click Then</v-btn>
  </v-container>
</template>

<script setup>
import { useDialog } from '@/composable/useDialog';

const clickedAsync = async () => {
  const response = await useDialog({ message: "this works very nice !" });
  if (response) {
    alert("Dialog confirmed " + response,)
  } else {
    alert("Dialog canceled " + response, response)
  }
}

const clickedThen = () => {
  useDialog({ message: "this works very nice !" }).then(response=>{
    if (response) {
    alert("Dialog confirmed " + response,)
  } else {
    alert("Dialog canceled " + response, response)
  }
  })
}
</script>
```
## Result
<div align="center">
<img src="/dialog.gif" width="70%"/>
</div>

## Github source
[vue-vuetify-composable-dialog](https://github.com/malnossi/vue-vuetify-composable-dialog)
## Final Words
Dialogs are essential for displaying critical information, confirmations, or forms without leaving the current page. However, managing dialogs can become cumbersome, especially in large-scale applications. Programmatic dialogs help mitigate this by creating dialogs on the fly using JavaScript, making them more manageable and reducing template bloat. Composable dialogs are built using the Composition API in Vue, enabling the encapsulation of dialog-related logic in a reusable and maintainable way.