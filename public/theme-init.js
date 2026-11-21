(function () {
  try {
    if (localStorage.getItem('writers-realm-theme') === 'dark') document.documentElement.classList.add('dark')
    if (localStorage.getItem('writers-realm-locale') === 'my') document.documentElement.lang = 'my'
  } catch (error) {}
})()
