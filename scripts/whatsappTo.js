'using strict';

const phoneNum=document.getElementById("phoneNum");
const whatsappLink=document.getElementById("whatsappLink");
phoneNum.addEventListener("keyup",() =>{        
    const num=phoneNum.value;
    if(num && num.length===10){                    
        whatsappLink.setAttribute("href",`https://wa.me/91${phoneNum.value}`);    
        whatsappLink.removeAttribute("hidden");
    }else{
        whatsappLink.setAttribute("hidden","hidden");
    }    
    
})
