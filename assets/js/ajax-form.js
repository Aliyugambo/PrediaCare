$(function() {
    // Validation rules
    var constraints = {
        name: {
            presence: true,
            length: {
                minimum: 1,
                message: "can't be empty"
            }
        },
        email: {
            presence: true,
            email: true
        },
        phone: {
            presence: true,
            format: {
                pattern: "^\\+?[0-9]{1,17}$", // Adjust pattern as needed
                message: "must be a valid phone number"
            }
        },
        subject: {
            presence: true,
            length: {
                minimum: 1,
                message: "can't be empty"
            }
        },
        message: {
            presence: true,
            length: {
                minimum: 1,
                message: "can't be empty"
            }
        } 
    };

    var form = $('#contact');
    var formMessages = $('.ajax-response');

    // Function to validate a specific field
    function validateField(field) {
        var fieldValue = $('#' + field).val();
        var errors = validate({ [field]: fieldValue }, constraints);
        var errorElement = $('#' + field + '-error');

        // Clear previous error and border
        $('#' + field).removeClass('error-border');
        errorElement.text('');

        if (errors && errors[field]) {
            errorElement.html(errors[field].join('<br>'));
            $('#' + field).addClass('error-border');
        }
    }

    // Function to validate the entire form
    function validateForm() {
        var formData = {
            name: $('#name').val(),
            email: $('#email').val(),
            phone: $('#phone').val(),
            subject: $('#subject').val(),
            message: $('#message').val() 
        };

        var errors = validate(formData, constraints);
        $('.form-control').removeClass('error-border'); // Remove error border
        $('.error').text(''); // Clear previous errors

        if (errors) {
            for (var field in errors) {
                if (errors.hasOwnProperty(field)) {
                    $('#' + field + '-error').html(errors[field].join('<br>'));
                    $('#' + field).addClass('error-border'); // Add error border
                }
            }
            return false;
        }
        return true;
    }

    // Event listeners for form fields
    $('#name, #email, #phone, #subject, #message').on('input change', function() {
        var fieldId = $(this).attr('id');
        validateField(fieldId);
    });

    // Set up an event listener for the contact form.
    $(form).submit(function(e) {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        var formData = $(form).serialize();
        // Submit the form using AJAX.
        $.ajax({
            type: 'POST',
            url: $(form).attr('action'),
            data: formData
        })
        .done(function(response) {
            $(formMessages).removeClass('error').addClass('success');
            $(formMessages).text(response);
            $('#contact input, #contact textarea, #contact select').val('');
            $('.form-control').removeClass('error-border'); // Clear error borders
            $('.error').text(''); // Clear any error messages
        })
        .fail(function(data) {
            $(formMessages).removeClass('success').addClass('error');
            $(formMessages).text(data.responseText || 'Oops! An error occurred and your message could not be sent.');
        });
    });
});