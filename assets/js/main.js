/*-----------------------------------------------------------------------
Template Name      : Carenix - Medical Care and Clinic HTML Template
Author             : pus_infotech
Author Portfolio   : https://themeforest.net/user/pus_infotech 
Version            : 1.0.0 
-------------------------------------------------------------------------
JS TABLE OF CONTENTS
-------------------------------------------------------------------------
1. mobile menu
2. offcanvas sidebar
3. header sticky
4. background image
5. hero slider
6. services slider
7. testimonials slider
8. testimonials slider two
9. testimonials slider three
10. partners slider
11. doctor slider
12. related slider
13. quantity
14. gallery magnificPopup 
15. video magnificPopup
16. counter
17. progress bar count
18. services mouseover
19. mousecursor
20. wow animation
21. twentytwenty
22. scroll to top
23. back-top
24. preloader
-----------------------------------------------------------------------*/
(function($) {
	"use strict";
	// start document ready function  
	$(document).ready( function() {
		// ------------------------ 1. mobile menu
		$("#mobile-menu").meanmenu({
            meanMenuContainer: '.mobile-menu',
            meanScreenWidth: "1199",
            meanExpand: ['<i class="fa-solid fa-plus"></i>'],
        }); 
		// ------------------------ 2. offcanvas sidebar		 
		$(document).on("click", "#offcanvas-sidebar li.dropdown .dropdown-btn", function () {
			$(this).toggleClass('open');
			$(this).prev('ul').slideToggle(500);
		});
		// ------------------------ 3. header sticky	 
		$(window).on("scroll", function() {
            if ($(this).scrollTop() > 250) {
                $(".header .header-lower").addClass("sticky");
            } else {
                $(".header .header-lower").removeClass("sticky");
            }
        });
		// ------------------------ 4. background image
		$("[data-img-src]").each(function () {
			var src = $(this).attr("data-img-src");
			$(this).css('background-image', 'url(' + src + ')');
			$(this).removeAttr("data-img-src");
		});
		// ------------------------ 5. hero slider
		if($('.hero-slider').length > 0) {
            const heroSlider = new Swiper(".hero-slider", {
				loop: true,
				effect: "fade",
				fadeEffect: {
					crossFade: true
				},
				slidesPerView: 1,
				spaceBetween: 0,
				autoplay: {
					delay: 5000,
					disableOnInteraction: false,
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },
            });
        }
		// ------------------------ 6. services slider
		if($('.services-slider').length > 0) {
            const servicesSlider = new Swiper(".services-slider", {
                loop: true,
				slidesPerView: 1,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},
				navigation: {
					nextEl: '.swiper-button-next',
					prevEl: '.swiper-button-prev',
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },
				breakpoints: {
					1920: {
						slidesPerView: 3,
					},
					1400: {
						slidesPerView: 3,
					},
					1199: {
						slidesPerView: 3,
						spaceBetween: 20
					},
					991: {
						slidesPerView: 2,
						spaceBetween: 20
					},
					767: {
						slidesPerView: 2,
						spaceBetween: 20
					},
					567: {
						slidesPerView: 2,  
						spaceBetween: 20
					},
					360: {
						slidesPerView: 1,  
						spaceBetween: 20
					},
					320: {
						slidesPerView: 1,  
						spaceBetween: 20
					}
				},
            });
        }
		// ------------------------ 7. testimonials slider
		if($('.testimonials-slider').length > 0) {
            const testimonialsSlider = new Swiper(".testimonials-slider", {
				loop: true,
				slidesPerView: 1,
				spaceBetween: 30,
				autoplay: {
					delay: 5500,
					disableOnInteraction: false,
				},				
				breakpoints: {
					1920: {
						slidesPerView: 1,
					},
					1400: {
						slidesPerView: 1,
					},
					1200: {
						slidesPerView: 1,
					},
					991: {
						slidesPerView: 1,
					},
					767: {
						slidesPerView: 1,
					},
					567: {
						slidesPerView: 1,  
					},
					320: {
						slidesPerView: 1,
					}
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },  
            });
        }
		// ------------------------ 8. testimonials slider two
		if($('.testimonials-slider-two').length > 0) {
            const testimonialsTwoSlider = new Swiper(".testimonials-slider-two", {
				loop: true,
				slidesPerView: 3,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},	
				pagination: {
                    el: ".dot",
                    clickable: true,
                },			
				breakpoints: {
					1920: {
						slidesPerView: 3,
					},
					1400: {
						slidesPerView: 3,
					},
					1199: {
						slidesPerView: 3,
					},
					991: {
						slidesPerView: 3,
					},
					767: {
						slidesPerView: 2,
					},
					567: {
						slidesPerView: 2,   
					},
					320: {
						slidesPerView: 1,  
					}
				}				 
            });
        }
		// ------------------------ 9. testimonials slider three
		if($('.testimonials-slider-three').length > 0) {
            const testimonialsThreeSlider = new Swiper(".testimonials-slider-three", {
				loop: true,
				slidesPerView: 1,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},				
				breakpoints: {
					1920: {
						slidesPerView: 2,
					},
					1400: {
						slidesPerView: 2,
					},
					1199: {
						slidesPerView: 2,
					},
					991: {
						slidesPerView: 1,
					},
					767: {
						slidesPerView: 1,
					},
					567: {
						slidesPerView: 1,  
					},
					320: {
						slidesPerView: 1,  
					}
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },  
            });
        }
		// ------------------------ 10. partners slider
		if($('.partners-slider').length > 0) {
            const partnersSlider = new Swiper(".partners-slider", { 
				loop: true,
				slidesPerView: 5,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},
				breakpoints: {
					1920: {
						slidesPerView: 5,
					},
					1199: {
						slidesPerView: 5,
					},
					991: {
						slidesPerView: 4,
					},
					767: {
						slidesPerView: 3,
					},
					567: {
						slidesPerView: 2,
					},
					320: {
						slidesPerView: 2,
					}
				} 
            });
        }
		// ------------------------ 11. doctor slider
		if($('.doctor-slider').length > 0) {
            const doctorSlider = new Swiper(".doctor-slider", {
				loop: true,
				slidesPerView: 3,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},				
				breakpoints: {
					1920: {
						slidesPerView: 3,
					},
					1400: {
						slidesPerView: 3,
					},
					1199: {
						slidesPerView: 3,
					},
					991: {
						slidesPerView: 3,
					},
					767: {
						slidesPerView: 2,
					},
					567: {
						slidesPerView: 2,   
					},
					320: {
						slidesPerView: 1,  
					}
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },  
            });
        }
		// ------------------------ 12. related slider
		if($('.related-slider').length > 0) {
            const relatedSlider = new Swiper(".related-slider", {
				loop: true,
				slidesPerView: 3,
				spaceBetween: 30,
				autoplay: {
					delay: 3500,
					disableOnInteraction: false,
				},				
				breakpoints: {
					1920: {
						slidesPerView: 3,
					},
					1400: {
						slidesPerView: 3,
					},
					1199: {
						slidesPerView: 3,
					},
					991: {
						slidesPerView: 3,
					},
					767: {
						slidesPerView: 2,
					},
					567: {
						slidesPerView: 2,   
					},
					320: {
						slidesPerView: 1,  
					}
				},
				pagination: {
                    el: ".dot",
                    clickable: true,
                },  
            });
        }
		// ------------------------ 13. quantity 
		$(document).on("click", ".qty-btn-plus", function () {
			var $n = $(this).parent(".quantity-content").find(".input-qty");
			$n.val(Number($n.val()) + 1);
		}); 
		$(document).on("click", ".qty-btn-minus", function () {
			var $n = $(this).parent(".quantity-content").find(".input-qty");
			var amount = Number($n.val());
			if (amount > 0) {
				$n.val(amount - 1);
			}
		});
		// ------------------------ 14. gallery magnificPopup 
		if ($(".photo-popup").length) {
			var groups = {};
			$(".photo-popup").each(function () {
				var id = parseInt($(this).attr("data-group"), 10);
				if (!groups[id]) {
					groups[id] = [];
				}
				groups[id].push(this);
			}); 
			$.each(groups, function () {
				$(this).magnificPopup({
					type: "image",
					closeOnContentClick: true,
					closeBtnInside: false,
					gallery: {
						enabled: true
					}
				});
			});
		}
		// ------------------------ 15. video magnificPopup
		$(".video-popup").magnificPopup({
			type:"iframe",
			mainClass:"mfp-fade",
			removalDelay:160,
			preloader:false,
			fixedContentPos:true
		});
		// ------------------------ 16. counter
		$(".counter-item").appear(function () {
			var $count = $(this),
			p = $count.find(".counter-value").attr("data-stop"),
			q = parseInt($count.find(".counter-value").attr("data-speed"), 10);

			if (!$count.hasClass('counted')) {
				$count.addClass('counted');
				$({
					countNum: $count.find(".counter-value").text()
				}).animate({
					countNum: p
				}, {
					duration: q,
					easing: "linear",
					step: function () {
						$count.find(".counter-value").text(Math.floor(this.countNum));
					},
					complete: function () {
						$count.find(".counter-value").text(this.countNum);
					}
				});
			}
		});
		// ------------------------ 17. progress bar count
		$(".progress-bar-count").appear(
			function () {
				var appcount = $(this);
				var percent = appcount.data("percent");
				$(appcount).css("width", percent).addClass("counted");
			}, {
			accY: -50
		});
		// ------------------------ 18. services mouseover
		if ($(".services-section-3").length) {
			$(document).on("mouseenter", ".services-section-3 .service-item", function () {
				const $section = $(this).closest(".services-section-3");
				$section.find(".service-item").removeClass("active");
				$(this).addClass("active");
			});
			$(document).on("mouseleave", ".services-section-3 .service-item", function () {
				const $section = $(this).closest(".services-section-3");
				if ($section.find(".active").length > 1) {
					$(this).removeClass("active");
				}
			});
		}
		// ------------------------ 19. mousecursor 
		const $cursorInner = document.querySelector(".cursor-inner");
        const $cursorOuter = document.querySelector(".cursor-outer");
        if ($("body").length && $cursorInner && $cursorOuter) {
            $(window).on("mousemove", function(e) {
                $cursorOuter.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
                $cursorInner.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            });

            $("body").on("mouseenter", "a, .cursor-pointer", function () {
                $cursorInner.classList.add("cursor-hover");
                $cursorOuter.classList.add("cursor-hover");
            }).on("mouseleave", "a, .cursor-pointer", function () {
                if (!$(this).is("a") || !$(this).closest(".cursor-pointer").length) {
                    $cursorInner.classList.remove("cursor-hover");
                    $cursorOuter.classList.remove("cursor-hover");
                }
            });

            $cursorInner.style.visibility = "visible";
            $cursorOuter.style.visibility = "visible";
        }
		// ------------------------ 20. wow animation 
        new WOW({
			boxClass:     'wow',
			animateClass: 'animated',
			offset:       0,
			mobile:       false,
			live:         true
		}).init();
		// ------------------------ 21. twentytwenty
		$(".transformation-image").twentytwenty({
			no_overlay: true,
		});
		// ------------------------ 22. scroll to top	 
		$(window).on("scroll", function () { 
			if ($(this).scrollTop() > 20) {
				$("#back-top").addClass("show");
			} else {
				$("#back-top").removeClass("show");
			}
		});
		// ------------------------ 23. back-top
		$(document).on("click", "#back-top", function() {
			$("html, body").animate({ 
				scrollTop: 0 
			}, 800);
			return false;
		});
	}); 
	// end document ready function
	
	// ------------------------ 24. preloader 
	function preloader() {
        $(window).on("load", function() { 
			$(".preloader").delay(600).fadeOut();
		});
    }
    preloader();
})(jQuery); // end jQuery