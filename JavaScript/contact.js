// Firebase configuration object provided by the user.
const firebaseConfig = {
    apiKey: "AIzaSyAo4MUZvb-eBcl_9Y3QBY64SJrNudQ",
    authDomain: "tyveklanka-a9dd1.firebaseapp.com",
    projectId: "tyveklanka-a9dd1",
    storageBucket: "tyveklanka-a9dd1.firebasestorage.app",
    messagingSenderId: "985040063470",
    appId: "1:985040063470:web:8034aba2c17aae72f45cff"
};

// Import necessary Firebase functions from the CDN.
// This is done here instead of a separate file.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Initialize Firebase.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Get a reference to the contact form and the submit button.
const contactForm = document.querySelector(".send-message form");
const submitButton = document.querySelector(".submit-btn");

// Listen for the form submission event.
contactForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Prevent the default form submission (page reload).

    // Get the values from the form inputs.
    const fullName = document.getElementById("full-name").value;
    const email = document.getElementById("email").value;
    const subject = document.getElementById("subject").value;
    const message = document.getElementById("message").value;

    // Show a loading state to the user.
    submitButton.textContent = "Sending...";
    submitButton.disabled = true;

    try {
        // Reference to the 'inquiries' collection in Firestore.
        const inquiriesCollection = collection(db, "inquiries");

        // Add a new document to the 'inquiries' collection with the form data.
        await addDoc(inquiriesCollection, {
            fullName: fullName,
            email: email,
            subject: subject,
            message: message,
            submittedAt: serverTimestamp() // Adds a server-generated timestamp.
        });

        // Show a success message to the user using a custom alert.
        alert("Thank you! Your message has been sent successfully.");

        // Reset the form fields for a new submission.
        contactForm.reset();

    } catch (error) {
        // Log the error to the console for debugging purposes.
        console.error("Error adding document: ", error);

        // Show an error message to the user.
        alert("An error occurred. Please try again later.");
    } finally {
        // Reset the button state whether the submission succeeded or failed.
        submitButton.textContent = "Send Message";
        submitButton.disabled = false;
    }
});