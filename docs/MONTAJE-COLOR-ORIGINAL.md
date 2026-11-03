# Conservar la luz y el color original al montar

El acabado «Color de cine» estaba activado por defecto y recordado en localStorage. Aplicaba igualación RGB entre clips y un look por estilo: viñeta (bordes oscuros), contraste, gamma, balance de color y grano. En el estilo épico, además de la viñeta, la gamma era 0.98. Esto podía oscurecer escenas que ya eran nocturnas.

Se retiran los looks impuestos por estilo. «Igualar color entre clips (opcional)» ahora solo conserva la igualación RGB existente cuando el usuario la activa expresamente; por defecto está apagada tanto en la interfaz como en el trabajador Python. Sin ella no se ejecuta esa igualación ni se añade look a la imagen.

Las preferencias nuevas se guardan en `estudio-viral:pro:v2`. Al leer las antiguas se respetan sonido, efectos y cámara, pero no se reactiva el color que antes venía marcado por defecto. Una elección explícita con la versión nueva sí se recuerda.

No se cambian escenas nocturnas, tarjetas, títulos, transiciones ni clips originales. El filtro de una exportación existente ya está incorporado a sus píxeles: actualizar el código no lo elimina del archivo. Para retirarlo con fidelidad se necesita remontar con los clips fuente. El archivo de escritorio revisado no se sobrescribió ni se aclaró artificialmente.

Validación: pruebas de preferencia antigua/nueva, conservación de los demás ajustes, almacenamiento corrupto/bloqueado; prueba de los valores reales de PRO_COLOR y LOOK del trabajador; 19 pruebas Python (incluye tiempos, UTF-8 y comandos largos), tipos y compilación. Lint conserva sus seis avisos anteriores.
