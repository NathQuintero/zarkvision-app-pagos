let brigadaSeleccionadaId = null;
let cacheClientesActuales = [];

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    const hoy = new Date();
    document.getElementById('txt-fecha-hoy').innerText = hoy.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    initApp();
    setupMascarasDinero(); // Activa los puntos automáticos al escribir
});

// Control del menú responsivo móvil
function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    sidebar.classList.toggle('open');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById('app-sidebar').classList.remove('open');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// FUNCIÓN DE FORMATO EN DINERO
function formatearDinero(numero) {
    if (!numero) return "$0";
    return "$" + Math.round(numero).toLocaleString('es-CO');
}

// FUNCIÓN PARA PONER PUNTOS AUTOMÁTICOS MIENTRAS ESCRIBES
function setupMascarasDinero() {
    const inputsDinero = ['c-lente', 'c-montura', 'c-extra', 'c-abono', 'abono-monto'];
    
    inputsDinero.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.type = 'text';
            input.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, ''); 
                if (val) {
                    e.target.value = Number(val).toLocaleString('es-CO');
                } else {
                    e.target.value = '';
                }
                
                if (id === 'c-lente' || id === 'c-montura' || id === 'c-extra') {
                    calcularTotalCliente();
                }
            });
        }
    });
}

function obtenerValorNumerico(id) {
    const input = document.getElementById(id);
    if (!input || !input.value) return 0;
    return parseFloat(input.value.replace(/\./g, '')) || 0;
}

function calcularTotalCliente() {
    const lente = obtenerValorNumerico('c-lente');
    const montura = obtenerValorNumerico('c-montura');
    const extra = obtenerValorNumerico('c-extra');
    const total = lente + montura + extra;
    
    document.getElementById('c-total').value = total;
    document.getElementById('c-total-format').value = formatearDinero(total);
}

async function initApp() {
    await refrescarDashboardYAlertas();
    await cargarBrigadasEstiloLaboratorio();
    setupFormListeners();
}

function setupFormListeners() {
    const formBrigada = document.getElementById('form-brigada');
    const formCliente = document.getElementById('form-cliente');
    const formRecordatorio = document.getElementById('form-recordatorio');
    const formAbono = document.getElementById('form-abono');
    
    // TRUCO MAESTRO: Clonar todos los formularios elimina los escuchadores repetidos en memoria
    if (formBrigada) {
        const clonFormBrigada = formBrigada.cloneNode(true);
        formBrigada.parentNode.replaceChild(clonFormBrigada, formBrigada);
    }
    if (formCliente) {
        const clonFormCliente = formCliente.cloneNode(true);
        formCliente.parentNode.replaceChild(clonFormCliente, formCliente);
    }
    if (formRecordatorio) {
        const clonFormRecordatorio = formRecordatorio.cloneNode(true);
        formRecordatorio.parentNode.replaceChild(clonFormRecordatorio, formRecordatorio);
    }
    if (formAbono) {
        const clonFormAbono = formAbono.cloneNode(true);
        formAbono.parentNode.replaceChild(clonFormAbono, formAbono);
    }

    // ==========================================
    // 1. ESCUCHA GUARDAR BRIGADA
    // ==========================================
    document.getElementById('form-brigada').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const botonGuardar = e.target.querySelector('button[type="submit"]');
        if (botonGuardar) {
            botonGuardar.disabled = true;
            botonGuardar.innerText = "Guardando...";
        }

        const b = {
            nombre_lugar: document.getElementById('b-lugar').value,
            fecha_evento: document.getElementById('b-fecha').value || new Date().toISOString().split('T')[0]
        };
        try {
            await DB.guardarBrigada(b);
            closeModal('modal-brigada');
            document.getElementById('form-brigada').reset();
            await initApp();
        } catch (err) { 
            alert("Error: " + err.message); 
        } finally {
            if (botonGuardar) {
                botonGuardar.disabled = false;
                botonGuardar.innerText = "Guardar Brigada";
            }
        }
    });

    // ==========================================
    // 2. ESCUCHA GUARDAR CLIENTE
    // ==========================================
    document.getElementById('form-cliente').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const botonGuardar = e.target.querySelector('button[type="submit"]');
        if (botonGuardar) {
            botonGuardar.disabled = true;
            botonGuardar.innerText = "Guardando...";
        }

        const total = parseFloat(document.getElementById('c-total').value) || 0;
        const abonoInicial = obtenerValorNumerico('c-abono');
        const metodoAbono = document.getElementById('c-abono-metodo').value; 
        
        const c = {
            brigada_id: brigadaSeleccionadaId,
            nombre: document.getElementById('c-nombre').value,
            telefono: document.getElementById('c-telefono').value,
            valor_lente: obtenerValorNumerico('c-lente'),
            valor_montura: obtenerValorNumerico('c-montura'),
            valor_extra: obtenerValorNumerico('c-extra'),
            valor_total: total,
            valor_abonado: abonoInicial,
            dia_pago_1: parseInt(document.getElementById('c-dia1').value),
            dia_pago_2: document.getElementById('c-dia2').value ? parseInt(document.getElementById('c-dia2').value) : null
        };

        try {
            // 1. Guardamos el cliente en la base de datos
            const { data: clienteGuardado, error: errCliente } = await supabase
                .from('clientes')
                .insert([c])
                .select()
                .single();

            if (errCliente) throw errCliente;
            
            // 2. Si puso un abono inicial, lo registramos de inmediato en el historial de abonos
            if (abonoInicial > 0 && clienteGuardado) {
                await supabase.from('abonos_clientes').insert([{ 
                    cliente_id: clienteGuardado.id, 
                    monto: abonoInicial,
                    metodo_pago: metodoAbono,
                    fecha: new Date().toISOString().split('T')[0] // Registra la fecha de hoy
                }]);
            }
            
            closeModal('modal-cliente');
            document.getElementById('form-cliente').reset();
            document.getElementById('c-total-format').value = "$0";
            
            // Refrescar todo en vivo
            await cargarClientesDeBrigada(brigadaSeleccionadaId);
            await cargarBrigadasEstiloLaboratorio(); 
            await refrescarDashboardYAlertas();
        } catch (err) { 
            alert("Error al guardar cliente: " + err.message); 
        }
    });

    // ==========================================
    // 3. ESCUCHA GUARDAR ABONO
    // ==========================================
    document.getElementById('form-abono').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('abono-cliente-id').value;
        const monto = obtenerValorNumerico('abono-monto'); 
        const metodo = document.getElementById('abono-metodo').value; 

        try {
            await DB.guardarAbono(id, monto, metodo); 
            document.getElementById('form-abono').reset();
            
            await cargarClientesDeBrigada(brigadaSeleccionadaId);
            await cargarBrigadasEstiloLaboratorio(); 
            await refrescarDashboardYAlertas();
            await abrirModalAbonosYHistorial(id); 
        } catch (err) { 
            alert("Error: " + err.message); 
        }
    });

    // ==========================================
    // 4. ESCUCHA GUARDAR RECORDATORIO (¡CORREGIDO PARA EVITAR DUPLICADOS!)
    // ==========================================
    document.getElementById('form-recordatorio').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const botonGuardar = e.target.querySelector('button[type="submit"]');
        if (botonGuardar) {
            botonGuardar.disabled = true;
            botonGuardar.innerText = "Guardando...";
        }

        const rec = {
            descripcion: document.getElementById('r-descripcion').value,
            fecha_alerta: document.getElementById('r-fecha').value
        };
        try {
            await DB.guardarRecordatorio(rec);
            closeModal('modal-recordatorio');
            document.getElementById('form-recordatorio').reset();
            await refrescarDashboardYAlertas();
        } catch (err) { 
            alert("Error: " + err.message); 
        } finally {
            if (botonGuardar) {
                botonGuardar.disabled = false;
                botonGuardar.innerText = "Nuevo Recordatorio";
            }
        }
    });
}

async function refrescarDashboardYAlertas() {
    const clientes = await DB.getAllClientes();
    const recordatorios = await DB.getRecordatoriosOptica();
    const brigadas = await DB.getBrigadas();
    
    document.getElementById('dash-total-brigadas').innerText = brigadas.length;
    document.getElementById('dash-total-clientes').innerText = clientes.length;
    
    const pendientesOptica = recordatorios.filter(r => !r.finalizado).length;
    document.getElementById('dash-alertas-optica').innerText = pendientesOptica;
    
    const diaHoy = new Date().getDate();
    const containerAlertas = document.getElementById('lista-alertas-cobro');
    containerAlertas.innerHTML = '';
    
    let contAlertas = 0;
    clientes.forEach(c => {
        const saldo = c.valor_total - c.valor_abonado;
        if(saldo > 0 && (c.dia_pago_1 === diaHoy || c.dia_pago_2 === diaHoy)) {
            contAlertas++;
            containerAlertas.innerHTML += `
                <div class="pendiente-row shadow-sm" style="background: #fffbeb; border-left: 4px solid #d97706; margin-bottom: 0.5rem; border-radius: 0.5rem;">
                    <div class="pendiente-left">
                        <div>
                            <span class="badge-alert">COBRO HOY</span>
                            <p class="pendiente-desc" style="margin-top:0.25rem;">${c.nombre}</p>
                            <p class="pendiente-date">Saldo Pendiente: <strong>${formatearDinero(saldo)}</strong></p>
                        </div>
                    </div>
                    <button class="btn" style="background:#22c55e; color:white;" onclick="enviarWhatsApp('${c.nombre}', '${c.telefono}', ${saldo})">
                        <i data-lucide="message-circle"></i> Enviar Recordatorio
                    </button>
                </div>
            `;
        }
    });
    
    if(contAlertas === 0) {
        containerAlertas.innerHTML = '<p style="color:var(--success); font-weight:500;">✨ No hay cobros programados para el día de hoy.</p>';
    }

    const containerRecs = document.getElementById('lista-recordatorios');
    containerRecs.innerHTML = '';
    
    // Obtenemos la fecha de hoy limpia (sin horas) para calcular bien los días
    const hoyClean = new Date();
    hoyClean.setHours(0,0,0,0);
    
    recordatorios.forEach(r => {
        let botonAccion = '';
        let estiloAlertaPronto = '';
        let etiquetaPronto = '';

        if (!r.finalizado) {
            botonAccion = `<button class="btn btn-sm btn-primary" onclick="finalizarTarea('${r.id}')">Resolver</button>`;
            
            // --- CÁLCULO DE DÍAS RESTANTES ---
            const fechaAlerta = new Date(r.fecha_alerta + 'T00:00:00'); // Evita desfases de zona horaria
            const diferenciaTiempo = fechaAlerta - hoyClean;
            const diasRestantes = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));

            // Si faltan 2 días o menos (o si ya está vencida)
            if (diasRestantes <= 2) {
                estiloAlertaPronto = 'background: #fef2f2; border-left: 4px solid #ef4444;'; // Fondo rojizo suave con borde rojo
                etiquetaPronto = `<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-bottom: 0.25rem; display: inline-block;">⚠️ ¡PRONTO! (${diasRestantes >= 0 ? 'Faltan ' + diasRestantes + ' días' : 'VENCIDO'})</span><br>`;
            }
        } else {
            // SI ESTÁ TACHADO: Mostramos el botón rojo de eliminar
            botonAccion = `
                <button class="btn btn-sm btn-danger" style="padding: 4px 8px;" onclick="eliminarRecordatorio('${r.id}')">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i> Borrar
                </button>
            `;
        }

        containerRecs.innerHTML += `
            <div class="pendiente-row ${r.finalizado ? 'done' : ''}" style="${estiloAlertaPronto}">
                <div class="pendiente-left">
                    <i data-lucide="${r.finalizado ? 'check-circle' : 'circle'}" class="${r.finalizado ? 'text-success' : 'text-muted'}"></i>
                    <div>
                        ${etiquetaPronto}
                        <p class="pendiente-desc" style="${r.finalizado ? 'text-decoration: line-through;' : ''}">${r.descripcion}</p>
                        <p class="pendiente-date">📅 Alerta: ${r.fecha_alerta}</p>
                    </div>
                </div>
                ${botonAccion}
            </div>
        `;
    });
    lucide.createIcons();
}

async function finalizarTarea(id) {
    await DB.marcarRecordatorioFinalizado(id);
    await refrescarDashboardYAlertas();
}

// CORREGIDA: AHORA MUESTRA EL NÚMERO DE CLIENTES REALES Y SUMA BIEN LOS VALORES EN VIVO
async function cargarBrigadasEstiloLaboratorio() {
    const grid = document.getElementById('grid-brigadas-cards');
    if (!grid) return;
    
    grid.innerHTML = '';
    const brigadas = await DB.getBrigadas();
    const todosClientes = await DB.getAllClientes();
    
    brigadas.forEach(b => {
        const clientesDeEsta = todosClientes.filter(c => c.brigada_id === b.id);
        let recaudado = 0;
        let totalVendido = 0;
        
        clientesDeEsta.forEach(c => {
            recaudado += parseFloat(c.valor_abonado || 0);
            totalVendido += parseFloat(c.valor_total || 0);
        });
        
        const porCobrar = totalVendido - recaudado;
        const esSeleccionada = b.id === brigadaSeleccionadaId ? 'selected' : '';

        grid.innerHTML += `
            <div class="lab-card ${esSeleccionada}" onclick="seleccionarBrigada('${b.id}', '${b.nombre_lugar}')">
                <div class="lab-header">
                    <div>
                        <h4 class="lab-title">${b.nombre_lugar} (${clientesDeEsta.length} clnt)</h4>
                        <span class="lab-meta">📅 ${b.fecha_evento}</span>
                    </div>
                    <button class="btn btn-sm btn-danger" style="padding: 4px 8px;" onclick="event.stopPropagation(); eliminarBrigada('${b.id}', '${b.nombre_lugar}')">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="lab-body-grid">
                    <div>
                        <p class="lab-stat-label">RECAUDADO</p>
                        <p class="lab-stat-val" style="color:var(--success)">${formatearDinero(recaudado)}</p>
                    </div>
                    <div>
                        <p class="lab-stat-label">POR COBRAR</p>
                        <p class="lab-stat-val" style="color:var(--danger)">${formatearDinero(porCobrar)}</p>
                    </div>
                </div>
            </div>
        `;
    });
    lucide.createIcons();
}

async function eliminarBrigada(id, nombre) {
    if (confirm(`⚠️ ¿Estás completamente seguro de eliminar la brigada "${nombre}"?\nEsto también podría borrar o desvincular los clientes de esta zona.`)) {
        try {
            const { error } = await supabase.from('brigadas').delete().eq('id', id);
            if (error) throw error;
            
            if (brigadaSeleccionadaId === id) {
                brigadaSeleccionadaId = null;
                document.getElementById('seccion-clientes-detalle').style.display = 'none';
            }
            
            await initApp();
        } catch (err) {
            alert("No se pudo eliminar la brigada: " + err.message);
        }
    }
}

async function seleccionarBrigada(id, nombre) {
    brigadaSeleccionadaId = id;
    document.getElementById('seccion-clientes-detalle').style.display = 'block';
    document.getElementById('titulo-brigada-actual').innerText = `Clientes en: ${nombre}`;
    await cargarClientesDeBrigada(id);
    await cargarBrigadasEstiloLaboratorio();
}

async function cargarClientesDeBrigada(id) {
    cacheClientesActuales = await DB.getClientesPorBrigada(id);
    renderizarTablaClientes(cacheClientesActuales);
}

function renderizarTablaClientes(lista) {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // TRUCO MAESTRO: Ordenamos la lista. Los que deben $0 (saldo <= 0) van al final.
    const listaOrdenada = [...lista].sort((a, b) => {
        const saldoA = a.valor_total - a.valor_abonado;
        const saldoB = b.valor_total - b.valor_abonado;
        
        const yaPagoA = saldoA <= 0 ? 1 : 0;
        const yaPagoB = saldoB <= 0 ? 1 : 0;
        
        return yaPagoA - yaPagoB; // Si ya pagó, se mueve abajo
    });
    
    listaOrdenada.forEach(c => {
        const saldo = c.valor_total - c.valor_abonado;
        const yaPago = saldo <= 0;
        
        // Si ya pagó, fila verde suave. Si no, fondo blanco normal.
        const estiloFila = yaPago 
            ? 'background-color: #f0fdf4; border-left: 4px solid #16a34a;' 
            : '';

        tbody.innerHTML += `
            <tr style="${estiloFila}">
                <td>
                    <strong>${c.nombre}</strong>
                    ${yaPago ? '<br><span style="background:#16a34a; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">¡PAGADO! ✨</span>' : ''}
                </td>
                <td>${c.telefono}</td>
                <td>
                    <span style="font-size:0.85rem; color:var(--text-muted)">Lente: ${formatearDinero(c.valor_lente)} | Montura: ${formatearDinero(c.valor_montura)}</span><br>
                    <strong>Total:</strong> ${formatearDinero(c.valor_total)}
                </td>
                <td>Día ${c.dia_pago_1}${c.dia_pago_2 ? ' y ' + c.dia_pago_2 : ''}</td>
                <td><strong style="color: ${yaPago ? 'var(--success)' : 'var(--danger)'}">${formatearDinero(saldo)}</strong></td>
                <td>
                    <div style="display:flex; gap:0.25rem;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalAbonosYHistorial('${c.id}')"><i data-lucide="wallet"></i> Pagos</button>
                        ${saldo > 0 ? `<button class="btn btn-sm" style="background:#22c55e; color:white;" onclick="enviarWhatsApp('${c.nombre}','${c.telefono}',${saldo})"><i data-lucide="message-square"></i> Cobro</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="eliminarCliente('${c.id}')"><i data-lucide="trash-2"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

function filtrarClientesLocalmente() {
    const busqueda = document.getElementById('buscar-cliente').value.toLowerCase();
    const filtrados = cacheClientesActuales.filter(c => c.nombre.toLowerCase().includes(busqueda));
    renderizarTablaClientes(filtrados);
}

// CORREGIDA: AHORA BUSCA SIEMPRE LOS SALDOS FRESCOS DE CACHÉ AL RE-RENDERIZAR
async function abrirModalAbonosYHistorial(clienteId) {
    const cliente = cacheClientesActuales.find(item => item.id === clienteId);
    if(!cliente) return;
    
    document.getElementById('abono-cliente-id').value = clienteId;
    document.getElementById('txt-abono-cliente-nombre').innerText = `Cliente: ${cliente.nombre}`;
    
    const saldo = cliente.valor_total - cliente.valor_abonado;
    document.getElementById('txt-abono-saldo-pendiente').innerText = formatearDinero(saldo);
    
    const abonos = await DB.getAbonosDeCliente(clienteId);
    const container = document.getElementById('lista-abonos-historial-items');
    container.innerHTML = '';
    
    abonos.forEach(a => {
        const fechaFormat = new Date(a.fecha || a.created_at).toLocaleDateString('es-CO');
        const metodoPago = a.metodo_pago || 'Efectivo'; 
        
        container.innerHTML += `
            <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee;">
                <div>
                    <strong>${formatearDinero(a.monto)}</strong>
                    <span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; font-weight: bold;">
                        ${metodoPago}
                    </span>
                    <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">📅 ${fechaFormat}</span>
                </div>
                <button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="eliminarAbono('${a.id}', '${clienteId}', ${a.monto})">✕</button>
            </div>
        `;
    });
    
    openModal('modal-abonos-historial');
}

async function eliminarCliente(id) {
    if(confirm("⚠ ¿Estás seguro de eliminar este cliente? Se borrará todo su historial financiero.")) {
        await DB.eliminarCliente(id);
        await cargarClientesDeBrigada(brigadaSeleccionadaId);
        await cargarBrigadasEstiloLaboratorio();
        await refrescarDashboardYAlertas();
    }
}

async function eliminarAbono(abonoId, clienteId, monto) {
    if(confirm(`¿Deseas eliminar este abono de ${formatearDinero(monto)}?`)) {
        await DB.eliminarAbono(abonoId, clienteId, monto);
        closeModal('modal-abonos-historial');
        await cargarClientesDeBrigada(brigadaSeleccionadaId);
        await cargarBrigadasEstiloLaboratorio();
        await refrescarDashboardYAlertas();
    }
}

function enviarWhatsApp(nombre, telefono, saldo) {
    const mensaje = `hola! ${nombre} te saluda zarkvision, pasamos por aqui para recordarte el abono de tus gafas, puedes hacerlo en efectivo, nequi o bancolombia, comentanos que metodo de pago te gustaria usar?`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
}
async function eliminarRecordatorio(id) {
    if (confirm("¿Estás seguro de que deseas eliminar este recordatorio del historial?")) {
        try {
            const { error } = await supabase.from('recordatorios_optica').delete().eq('id', id);
            if (error) throw error;
            
            // Recargamos la interfaz para que desaparezca de inmediato
            await refrescarDashboardYAlertas();
        } catch (err) {
            alert("No se pudo eliminar el recordatorio: " + err.message);
        }
    }
}