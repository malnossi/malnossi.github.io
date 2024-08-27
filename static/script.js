if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.querySelectorAll("#homeicon").forEach(el => {
        el.classList.add("transparent")
    })



}
window.matchMedia('(prefers-color-scheme: light)').addEventListener("change", event => {
    const buttons = document.querySelectorAll("#homeicon")
    if (event.matches) {
        buttons.forEach(el => {
            el.classList.remove("transparent")
            el.classList.add("is-white")
        })
    } else {
        buttons.forEach(el => {
            el.classList.add("transparent")
            el.classList.remove("is-white")
        })
    }

})