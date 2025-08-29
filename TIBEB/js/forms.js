document.addEventListener('DOMContentLoaded', () => {
    const signinForm = document.querySelector('.login-box form');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('mail')?.value?.trim();
            const password = document.getElementById('pwd')?.value;
            try {
                const res = await fetch('/api/signin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Signin failed');
                localStorage.setItem('token', data.token);
                alert('Signed in successfully');
                window.location.href = 'index.html';
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const signupForm = document.querySelector('.signup-box form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = document.getElementById('fname')?.value?.trim();
            const lastName = document.getElementById('lname')?.value?.trim();
            const email = document.getElementById('mail')?.value?.trim();
            const password = document.getElementById('pwd')?.value;
            const confirmPassword = document.getElementById('cpwd')?.value;
            try {
                const res = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName, lastName, email, password, confirmPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Signup failed');
                localStorage.setItem('token', data.token);
                alert('Account created successfully');
                window.location.href = 'signin.html';
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('Full-name')?.value?.trim();
            const email = document.getElementById('mail')?.value?.trim();
            const message = document.getElementById('tarea')?.value?.trim();
            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email, message })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Submission failed');
                alert('Message sent!');
                contactForm.reset();
            } catch (err) {
                alert(err.message);
            }
        });
    }
});

